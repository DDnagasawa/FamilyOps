import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getConfig } from "../config/env.js";

const execFileAsync = promisify(execFile);
const SNAPSHOT_PATH = path.join(process.cwd(), "data", "folder_snapshots.json");
const PROJECT_SYNC_PATH = path.join(process.cwd(), "data", "project_sync.json");
const SOCIAL_OUTBOX_PATH = path.join(process.cwd(), "data", "social_outbox.json");
const SAMPLE_CONTEXT_PATH = path.join(process.cwd(), "data", "sample_context.json");

function ensureJsonArray(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]\n", "utf8");
  }
}

function resolveInside(root, targetPath) {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(absoluteRoot, targetPath);
  if (absoluteTarget !== absoluteRoot && !absoluteTarget.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Path is outside allowed root: ${targetPath}`);
  }
  return absoluteTarget;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function walkFiles(root, { maxFiles = 200 } = {}) {
  const files = [];
  const stack = [root];

  while (stack.length && files.length < maxFiles) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const stats = fs.statSync(current);
    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        if (entry === "node_modules" || entry === ".git") continue;
        stack.push(path.join(current, entry));
      }
      continue;
    }
    files.push({
      path: current,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    });
  }

  return files;
}

export function organizeLocalFiles({ sourceDir, targetDir = "data/organized", dryRun = true } = {}) {
  if (!sourceDir) throw new Error("sourceDir is required.");
  const config = getConfig().localExecution;
  const source = resolveInside(config.allowedRoot, sourceDir);
  const target = resolveInside(config.allowedRoot, targetDir);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Source directory does not exist: ${sourceDir}`);
  }

  const moves = fs
    .readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const ext = path.extname(entry.name).replace(".", "") || "no-extension";
      return {
        from: path.join(source, entry.name),
        to: path.join(target, ext, entry.name),
      };
    });

  if (!dryRun) {
    for (const move of moves) {
      fs.mkdirSync(path.dirname(move.to), { recursive: true });
      fs.renameSync(move.from, move.to);
    }
  }

  return {
    dryRun,
    sourceDir: path.relative(config.allowedRoot, source),
    targetDir: path.relative(config.allowedRoot, target),
    moves: moves.map((move) => ({
      from: path.relative(config.allowedRoot, move.from),
      to: path.relative(config.allowedRoot, move.to),
    })),
  };
}

export async function runLocalScript({ script, args = [], timeoutMs = 30_000 } = {}) {
  if (!script) throw new Error("script is required.");
  const config = getConfig().localExecution;
  const scriptRoot = resolveInside(config.allowedRoot, config.allowedScriptDir);
  const scriptPath = resolveInside(scriptRoot, script);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script does not exist in allowed script directory: ${script}`);
  }

  const result = await execFileAsync(scriptPath, args.map(String), {
    cwd: config.allowedRoot,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });

  return {
    script: path.relative(config.allowedRoot, scriptPath),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function scanFolderChanges({ paths, maxFiles = 200 } = {}) {
  const config = getConfig().localExecution;
  const selectedPaths = paths?.length ? paths : config.folderWatchPaths;
  const previous = readJson(SNAPSHOT_PATH, {});
  const next = {};
  const changes = [];

  for (const watchPath of selectedPaths) {
    const root = resolveInside(config.allowedRoot, watchPath);
    const files = walkFiles(root, { maxFiles });
    next[watchPath] = files.map((file) => ({
      path: path.relative(config.allowedRoot, file.path),
      size: file.size,
      modifiedAt: file.modifiedAt,
    }));

    const before = new Map((previous[watchPath] || []).map((file) => [file.path, file]));
    const after = new Map(next[watchPath].map((file) => [file.path, file]));

    for (const file of next[watchPath]) {
      const old = before.get(file.path);
      if (!old) changes.push({ type: "added", ...file });
      else if (old.modifiedAt !== file.modifiedAt || old.size !== file.size) changes.push({ type: "modified", ...file });
    }
    for (const file of before.values()) {
      if (!after.has(file.path)) changes.push({ type: "removed", ...file });
    }
  }

  writeJson(SNAPSHOT_PATH, next);
  return {
    scannedAt: new Date().toISOString(),
    watchedPaths: selectedPaths,
    changeCount: changes.length,
    changes,
  };
}

export function syncProjectContext({ destination = PROJECT_SYNC_PATH } = {}) {
  const context = readJson(SAMPLE_CONTEXT_PATH, { projects: [] });
  const payload = {
    syncedAt: new Date().toISOString(),
    source: path.relative(process.cwd(), SAMPLE_CONTEXT_PATH),
    projects: (context.projects || []).map((project) => ({
      name: project.name,
      status: project.status,
      summary: project.summary,
      tasks: project.tasks || [],
      taskCounts: (project.tasks || []).reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {}),
    })),
  };
  writeJson(destination, payload);
  return payload;
}

export function enqueueSocialPost({ text, platform = "generic", account = "default" } = {}) {
  if (!text) throw new Error("text is required.");
  ensureJsonArray(SOCIAL_OUTBOX_PATH);
  const outbox = readJson(SOCIAL_OUTBOX_PATH, []);
  const item = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    platform,
    account,
    text,
    status: "queued_for_manual_or_connector_publish",
  };
  outbox.push(item);
  writeJson(SOCIAL_OUTBOX_PATH, outbox);
  return item;
}
