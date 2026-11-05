import fs from "node:fs";
import path from "node:path";

function readTextFile(filePath, maxChars = 16_000) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.length > maxChars ? raw.slice(-maxChars) : raw;
}

function parseMarkdownTasks(text, source) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^- \[[ x]\]/i.test(line))
    .slice(-80)
    .map((line) => {
      const done = /^- \[x\]/i.test(line);
      return {
        source,
        done,
        title: line.replace(/^- \[[ x]\]\s*/i, ""),
      };
    });
}

function parseJsonFile(filePath, source) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(value)) {
      const recent = value.slice(-5).map((item) => ({
        timestamp: item.timestamp || item.createdAt || item.startedAt || "",
        status: item.status || "",
        skill: item.skill || item.task?.skillName || "",
        tool: item.tool || "",
        id: item.id || item.agentRunId || "",
      }));
      return {
        source,
        type: "json_array",
        count: value.length,
        recent,
      };
    }
    return {
      source,
      type: "json_object",
      keys: Object.keys(value).slice(0, 20),
    };
  } catch {
    return null;
  }
}

function formatJsonSummary(parsed) {
  if (!parsed) return "JSON file could not be parsed.";
  if (parsed.type === "json_array") {
    const recent = parsed.recent
      .map((item) => [item.status, item.skill || item.tool, item.timestamp].filter(Boolean).join(" / "))
      .filter(Boolean)
      .join("; ");
    return `JSON array with ${parsed.count} records. Recent: ${recent || "none"}`;
  }
  return `JSON object keys: ${parsed.keys.join(", ")}`;
}

function summariseFile(filePath, rootDir) {
  const relativePath = path.relative(rootDir, filePath);
  const stats = fs.statSync(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json") {
    const parsed = parseJsonFile(filePath, relativePath);
    return {
      path: relativePath,
      modifiedAt: stats.mtime.toISOString(),
      summary: formatJsonSummary(parsed),
      openTasks: [],
      completedTasks: [],
    };
  }

  const text = readTextFile(filePath);
  const tasks = parseMarkdownTasks(text, relativePath);
  const openTasks = tasks.filter((task) => !task.done).slice(0, 12);
  const completedTasks = tasks.filter((task) => task.done).slice(-8);
  const headings = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,3}\s+/.test(line))
    .slice(-8)
    .map((line) => line.replace(/^#{1,3}\s+/, ""));

  return {
    path: relativePath,
    modifiedAt: stats.mtime.toISOString(),
    summary: headings.length ? `Recent sections: ${headings.join("; ")}` : "Text source scanned.",
    openTasks,
    completedTasks,
  };
}

function summariseAuditLog(filePath, rootDir) {
  const relativePath = path.relative(rootDir, filePath);
  const text = readTextFile(filePath, 24_000);
  const lines = text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12);

  return {
    path: relativePath,
    modifiedAt: fs.statSync(filePath).mtime.toISOString(),
    summary: `Recent audit entries: ${lines.length}`,
    recent: lines.map((line) => {
      try {
        const entry = JSON.parse(line);
        return {
          timestamp: entry.timestamp,
          skill: entry.skill,
          tool: entry.tool,
          status: entry.status,
        };
      } catch {
        return { raw: line.slice(0, 160) };
      }
    }),
    openTasks: [],
    completedTasks: [],
  };
}

export function collectRealInfoSources({ paths = [], rootDir = process.cwd() } = {}) {
  const sources = [];
  const missing = [];

  for (const sourcePath of paths) {
    const absolutePath = path.resolve(rootDir, sourcePath);
    if (!fs.existsSync(absolutePath)) {
      missing.push(sourcePath);
      continue;
    }

    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      const files = fs
        .readdirSync(absolutePath)
        .filter((name) => [".md", ".txt", ".json"].includes(path.extname(name).toLowerCase()))
        .slice(0, 20)
        .map((name) => path.join(absolutePath, name));
      for (const file of files) {
        sources.push(summariseFile(file, rootDir));
      }
      continue;
    }

    if (path.basename(absolutePath) === "audit.log") {
      sources.push(summariseAuditLog(absolutePath, rootDir));
    } else {
      sources.push(summariseFile(absolutePath, rootDir));
    }
  }

  const openTasks = sources.flatMap((source) => source.openTasks || []);
  const completedTasks = sources.flatMap((source) => source.completedTasks || []);

  return {
    collectedAt: new Date().toISOString(),
    sourceCount: sources.length,
    missing,
    sources,
    openTasks,
    completedTasks,
  };
}
