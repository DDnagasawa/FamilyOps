import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../bootstrap.js";
import { createFamilyInvite, getFamilyForToken, getUserByToken, listPublicUsers, loginUser, logoutUser, registerUser, updateUserProfile } from "../auth/userStore.js";
import {
  addFamilyTodo,
  completeFamilyTodo,
  deleteFamilyTodo,
  expandRecurringEvents,
  listFamilyReminders,
  readFamilyPlan,
  updateFamilyEventRecipients,
  updateFamilyTodo,
} from "../connectors/familyPlanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, "../../public/family-app");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  });
  response.end(JSON.stringify(payload));
}

function sendStatic(response, requestPath) {
  const targetPath = requestPath === "/" || requestPath === "/app" ? "/index.html" : requestPath.replace(/^\/app\//, "/");
  const filePath = path.normalize(path.join(APP_DIR, targetPath));
  if (!filePath.startsWith(APP_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(fs.readFileSync(filePath));
}

function buildSnapshot() {
  const plan = readFamilyPlan();
  const today = new Date().toISOString().slice(0, 10);
  return {
    plan: expandRecurringEvents(plan, {
      from: addUtcDays(today, -365),
      to: addUtcDays(today, 730),
    }),
    reminders: listFamilyReminders({ daysAhead: 1 }),
    now: new Date().toISOString(),
  };
}

function addUtcDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildAgentStatus(app) {
  const tools = app.toolRegistry.list();
  const skills = app.skillRegistry.list();
  const connectors = app.connectorRegistry.list();
  return {
    architecture: "Hermes/OpenClaw-inspired Codex-in-the-loop local execution architecture",
    pipeline: ["observe", "recall", "think", "plan", "privacy", "execute", "suggest", "remind", "todo_sync"],
    model: {
      provider: app.modelAdapter?.provider || "unknown",
      mode: ["openai", "doubao", "anthropic", "gemini", "ollama"].includes(app.modelAdapter?.provider)
        ? "direct_model_api"
        : "codex_in_the_loop_or_local_rules",
    },
    modules: {
      skills: skills.length,
      tools: tools.length,
      connectors: connectors.length,
      approvals: app.approvalQueue.list("pending").length,
      auditEntries: app.auditLog.list().length,
      familyUsers: listPublicUsers().length,
      backgroundReview: Boolean(app.memoryLearning?.getSettings?.().reviewEnabled),
    },
    enabledTools: tools.map((tool) => ({
      name: tool.name,
      riskLevel: tool.riskLevel,
      description: tool.description,
    })),
    connectors: connectors.map((connector) => ({
      name: connector.name,
      status: connector.status,
      description: connector.description,
    })),
  };
}

function authToken(request) {
  const header = request.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "";
}

function currentUser(request) {
  return getUserByToken(authToken(request));
}

function requireUser(request, response) {
  const user = currentUser(request);
  if (!user) {
    sendJson(response, 401, { ok: false, error: "not_logged_in" });
    return null;
  }
  return user;
}

function syncProfileMemories(app, user) {
  if (!user || !app.memoryLearning) return;
  const base = { userId: user.id, familyId: user.familyId || "default", source: "profile" };
  const memories = [
    { type: "identity", key: "displayName", value: user.displayName },
    { type: "identity", key: "nickname", value: user.nickname },
    { type: "identity", key: "familyRole", value: user.familyRole },
    { type: "birthday", key: "birthday", value: user.birthday },
    { type: "preference", key: "interests", value: user.preferences?.interests },
    { type: "preference", key: "foodPreferences", value: user.preferences?.foodPreferences },
    { type: "allergy", key: "allergies", value: user.preferences?.allergies },
    { type: "preference", key: "dislikes", value: user.preferences?.dislikes },
    { type: "address", key: "addresses", value: user.addresses },
    { type: "reminder", key: "defaultReminderTime", value: user.defaultReminderTime },
  ];
  for (const memory of memories) {
    if (!hasMemoryValue(memory.value)) continue;
    app.memoryLearning.addMemory({ ...base, ...memory });
  }
}

function hasMemoryValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(hasMemoryValue);
  if (typeof value === "object") return Object.values(value).some(hasMemoryValue);
  return true;
}

function familyUsersFor(request) {
  const user = currentUser(request);
  return listPublicUsers(undefined, user?.familyId || "default");
}

async function handleApi({ app, request, response, url }) {
  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readBody(request);
    const result = registerUser(body);
    syncProfileMemories(app, result.user);
    sendJson(response, 200, { ok: true, ...result });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/family/invite") {
    sendJson(response, 200, { ok: true, family: createFamilyInvite() });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(request);
    const result = loginUser(body);
    sendJson(response, 200, { ok: true, ...result });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = getUserByToken(authToken(request));
    sendJson(response, user ? 200 : 401, user ? { ok: true, user } : { ok: false, error: "not_logged_in" });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/family") {
    const family = getFamilyForToken(authToken(request));
    sendJson(response, family ? 200 : 401, family ? { ok: true, family } : { ok: false, error: "not_logged_in" });
    return true;
  }

  if (request.method === "PATCH" && url.pathname === "/api/auth/profile") {
    const body = await readBody(request);
    const result = updateUserProfile(body, authToken(request));
    syncProfileMemories(app, result.user);
    sendJson(response, 200, { ok: true, ...result });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const result = logoutUser(authToken(request));
    sendJson(response, 200, { ok: true, ...result });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/learning/settings") {
    const user = requireUser(request, response);
    if (!user) return true;
    sendJson(response, 200, { ok: true, settings: app.memoryLearning.getSettings(user.id) });
    return true;
  }

  if (request.method === "PATCH" && url.pathname === "/api/learning/settings") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readBody(request);
    sendJson(response, 200, { ok: true, settings: app.memoryLearning.updateSettings(body, user.id) });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/learning/memories") {
    const user = requireUser(request, response);
    if (!user) return true;
    sendJson(response, 200, {
      ok: true,
      memories: app.memoryLearning.listMemories({ userId: user.id, familyId: user.familyId || "default", includeSensitive: true }),
    });
    return true;
  }

  if (request.method === "DELETE" && url.pathname === "/api/learning/memories") {
    const user = requireUser(request, response);
    if (!user) return true;
    sendJson(response, 200, { ok: true, result: app.memoryLearning.clearUserMemories({ userId: user.id, familyId: user.familyId || "default" }) });
    return true;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/learning/memories/")) {
    const user = requireUser(request, response);
    if (!user) return true;
    const id = decodeURIComponent(url.pathname.split("/").pop());
    sendJson(response, 200, { ok: true, result: app.memoryLearning.deleteMemory({ id, userId: user.id, familyId: user.familyId || "default" }) });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/learning/candidates") {
    const user = requireUser(request, response);
    if (!user) return true;
    sendJson(response, 200, { ok: true, candidates: app.memoryLearning.listCandidates({ userId: user.id, familyId: user.familyId || "default" }) });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/learning/feedback") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readBody(request);
    sendJson(response, 200, {
      ok: true,
      result: app.memoryLearning.recordFeedback({
        userId: user.id,
        familyId: user.familyId || "default",
        type: body.type,
        targetId: body.targetId,
        metadata: body.metadata,
        source: "family_app",
      }),
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/learning/review/run") {
    const user = requireUser(request, response);
    if (!user) return true;
    sendJson(response, 200, {
      ok: true,
      result: app.memoryLearning.runReview({ userId: user.id, familyId: user.familyId || "default", force: true }),
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/learning/review") {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readBody(request);
    sendJson(response, 200, {
      ok: true,
      result: app.memoryLearning.reviewCandidate({
        id: body.id,
        action: body.action,
        userId: user.id,
        familyId: user.familyId || "default",
        reviewer: user.id,
      }),
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/family/plan") {
    sendJson(response, 200, { ok: true, currentUser: getUserByToken(authToken(request)), ...buildSnapshot() });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/agent/status") {
    sendJson(response, 200, { ok: true, status: buildAgentStatus(app) });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/family/chat") {
    const body = await readBody(request);
    const user = currentUser(request);
    const agentTurn = await app.familyAgent.run({
      text: body.text,
      source: "family_app",
      currentUser: user,
      familyId: user?.familyId || "default",
      familyUsers: familyUsersFor(request),
      sendLark: false,
      includeWebResults: Boolean(body.includeWebResults),
    });
    sendJson(response, 200, {
      ok: true,
      result: {
        report: agentTurn.reply,
        agentTurn,
      },
      ...buildSnapshot(),
    });
    return true;
  }

  if (request.method === "PATCH" && /^\/api\/family\/events\/[^/]+\/recipients$/.test(url.pathname)) {
    const user = requireUser(request, response);
    if (!user) return true;
    const body = await readBody(request);
    const id = decodeURIComponent(url.pathname.split("/")[4]);
    try {
      const result = updateFamilyEventRecipients({ id, recipients: body.recipients });
      app.auditLog?.write?.({
        skill: "family_app",
        tool: "update_event_recipients",
        inputSummary: { id, recipients: result.event.recipients, by: user.displayName },
        outputSummary: { status: "updated" },
        riskLevel: "low",
        permissionDecision: "allowed",
        status: "success",
      });
      sendJson(response, 200, { ok: true, result, ...buildSnapshot() });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/family/todos") {
    const body = await readBody(request);
    const result = addFamilyTodo(body);
    sendJson(response, 200, { ok: true, result, ...buildSnapshot() });
    return true;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/family/todos/")) {
    const body = await readBody(request);
    const parts = url.pathname.split("/");
    const id = parts[4];
    const result = updateFamilyTodo({ ...body, id });
    sendJson(response, 200, { ok: true, result, ...buildSnapshot() });
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/family/todos/") && url.pathname.endsWith("/complete")) {
    const body = await readBody(request);
    const parts = url.pathname.split("/");
    const id = parts[4];
    const result = completeFamilyTodo({ kind: body.kind || "task", id });
    sendJson(response, 200, { ok: true, result, ...buildSnapshot() });
    return true;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/family/todos/")) {
    const body = await readBody(request);
    const parts = url.pathname.split("/");
    const id = parts[4];
    const result = deleteFamilyTodo({ kind: body.kind || "task", id });
    sendJson(response, 200, { ok: true, result, ...buildSnapshot() });
    return true;
  }

  return false;
}

export function createAppServer({ app = createApp() } = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        });
        response.end();
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        const handled = await handleApi({ app, request, response, url });
        if (!handled) sendJson(response, 404, { ok: false, error: "unknown_api_route" });
        return;
      }
      sendStatic(response, url.pathname);
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error.message });
    }
  });
}

export function startAppServer({ port = Number(process.env.APP_PORT || 5177), host = "127.0.0.1" } = {}) {
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(JSON.stringify({ ok: true, server: "family-app", url: `http://${host}:${port}/app` }, null, 2));
  });
  return server;
}
