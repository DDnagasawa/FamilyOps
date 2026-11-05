import http from "node:http";
import { createApp } from "../bootstrap.js";
import { getConfig } from "../config/env.js";
import { appendLarkInboxMessage } from "../connectors/larkInbox.js";
import { sendLarkMessage } from "../connectors/lark.js";

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function extractAction(payload) {
  const value =
    payload?.action?.value ||
    payload?.event?.action?.value ||
    payload?.event?.operator?.action?.value ||
    payload?.value ||
    {};
  return {
    action: value.action,
    approvalId: value.approvalId,
    kind: value.kind,
    id: value.id,
  };
}

function extractFamilyPlanRequest(payload) {
  if (typeof payload?.text === "string") {
    return {
      text: payload.text.trim(),
      sendLark: payload.sendLark,
      source: "direct",
    };
  }

  const message = payload?.event?.message;
  if (!message) return null;

  let content = {};
  if (typeof message.content === "string") {
    try {
      content = JSON.parse(message.content);
    } catch {
      content = { text: message.content };
    }
  } else if (message.content && typeof message.content === "object") {
    content = message.content;
  }

  const rawText = String(content.text || "").trim();
  const command = rawText.match(/^(agent:|agent\s+|家庭:|安排:|todo\s+|to do\s+|待办[:：\s]+|任务[:：\s]+|提醒我\s*)\s*(.+)$/i);
  if (!command) {
    return {
      ignored: true,
      reason: "missing_family_agent_prefix",
    };
  }

  return {
    text: command[2].trim(),
    rawText,
    sendLark: payload.sendLark ?? true,
    source: "lark_message_event",
    chatId: message.chat_id,
    messageId: message.message_id || message.messageId || null,
    senderId: payload?.event?.sender?.sender_id?.open_id || payload?.event?.sender?.sender_id?.user_id || null,
  };
}

async function handleFamilyPlanRequest({ app, payload }) {
  const familyRequest = extractFamilyPlanRequest(payload);
  if (!familyRequest) {
    return { statusCode: 400, body: { ok: false, error: "missing_family_plan_text" } };
  }

  if (familyRequest.ignored) {
    return { statusCode: 200, body: { ok: true, ignored: true, reason: familyRequest.reason } };
  }

  if (familyRequest.source === "lark_message_event") {
    const inboxMessage = appendLarkInboxMessage({
      text: familyRequest.text,
      rawText: familyRequest.rawText,
      chatId: familyRequest.chatId || null,
      messageId: familyRequest.messageId || null,
      senderId: familyRequest.senderId || null,
    });
    let acknowledgement = null;
    if (familyRequest.chatId) {
      acknowledgement = await sendLarkMessage({
        receiveIdType: "chat_id",
        receiveId: familyRequest.chatId,
        text: [`收到：${familyRequest.text}`, "已加入 Codex 家庭事务处理队列。"].join("\n"),
      });
    }

    return {
      statusCode: 200,
      body: {
        ok: true,
        source: familyRequest.source,
        chatId: familyRequest.chatId || null,
        inboxMessageId: inboxMessage.id,
        status: "queued_for_codex",
        acknowledgement,
      },
    };
  }

  const result = await app.runtime.runSkill("family_coordinator", {
    text: familyRequest.text,
    sendLark: familyRequest.sendLark,
  });

  return {
    statusCode: 200,
    body: {
      ok: true,
      source: familyRequest.source,
      chatId: familyRequest.chatId || null,
      result: result.result,
    },
  };
}

export function createCallbackServer({ app = createApp() } = {}) {
  const config = getConfig();

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: "callback-server" });
        return;
      }

      const isCallbackPath = url.pathname === config.callback.path;
      const isFamilyPlanPath = url.pathname === "/family/plan";
      if (request.method !== "POST" || (!isCallbackPath && !isFamilyPlanPath)) {
        sendJson(response, 404, { ok: false, error: "not_found" });
        return;
      }

      const rawBody = await readBody(request);
      const payload = rawBody ? JSON.parse(rawBody) : {};

      if (payload.type === "url_verification" && payload.challenge) {
        sendJson(response, 200, { challenge: payload.challenge });
        return;
      }

      if (config.callback.verificationToken && payload.token && payload.token !== config.callback.verificationToken) {
        sendJson(response, 401, { ok: false, error: "invalid_token" });
        return;
      }

      if (url.pathname === "/family/plan" || payload?.event?.message) {
        const result = await handleFamilyPlanRequest({ app, payload });
        sendJson(response, result.statusCode, result.body);
        return;
      }

      const { action, approvalId, kind, id } = extractAction(payload);
      if (action === "complete_todo") {
        const completed = await app.toolRegistry.execute(
          "complete_family_todo",
          { kind, id },
          {
            agentRunId: "lark-todo-callback",
            skillName: "family_todo_list",
            allowedTools: ["complete_family_todo"],
          }
        );

        let refreshed = null;
        if (completed.ok) {
          refreshed = await app.runtime.runSkill("family_todo_list", {});
        }

        sendJson(response, completed.ok ? 200 : 400, {
          toast: {
            type: completed.ok ? "success" : "error",
            content: completed.ok ? "Todo marked done." : completed.error,
          },
          completed,
          refreshed: refreshed?.result || null,
        });
        return;
      }

      if (!approvalId || !["approve", "reject"].includes(action)) {
        sendJson(response, 400, { ok: false, error: "invalid_approval_action" });
        return;
      }

      const result =
        action === "approve"
          ? app.approvalQueue.approve(approvalId, "approved from Lark interactive card")
          : app.approvalQueue.reject(approvalId, "rejected from Lark interactive card");

      sendJson(response, 200, {
        toast: {
          type: "success",
          content: `Approval ${result.status}: ${approvalId}`,
        },
      });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error.message });
    }
  });
}

export function startCallbackServer() {
  const config = getConfig();
  const server = createCallbackServer();
  server.listen(config.callback.port, config.callback.host, () => {
    console.log(
      JSON.stringify(
        {
          ok: true,
          server: "callback-server",
          host: config.callback.host,
          port: config.callback.port,
          path: config.callback.path,
          health: `http://${config.callback.host}:${config.callback.port}/health`,
        },
        null,
        2
      )
    );
  });
  return server;
}
