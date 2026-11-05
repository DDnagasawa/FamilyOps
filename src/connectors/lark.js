import { createHmac } from "node:crypto";
import { getConfig } from "../config/env.js";

function createLarkSign(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", secret).update(stringToSign).digest("base64");
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned non-JSON response: ${response.status} ${text}`);
  }

  if (!response.ok || payload.code !== 0) {
    throw new Error(`${label} failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function getLarkTenantAccessToken() {
  const config = getConfig().lark;
  if (!config.appId) {
    throw new Error("Missing LARK_APP_ID");
  }
  if (!config.appSecret) {
    throw new Error("Missing LARK_APP_SECRET");
  }

  const response = await fetch(`${config.apiBaseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });

  const payload = await readJsonResponse(response, "Lark tenant access token request");
  if (!payload.tenant_access_token) {
    throw new Error("Lark tenant access token response did not include tenant_access_token");
  }

  return payload.tenant_access_token;
}

export async function listLarkBotChats({ pageSize = 50 } = {}) {
  const config = getConfig().lark;
  const token = await getLarkTenantAccessToken();
  const chats = [];
  let pageToken = "";

  do {
    const url = new URL(`${config.apiBaseUrl}/open-apis/im/v1/chats`);
    url.searchParams.set("page_size", String(pageSize));
    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await readJsonResponse(response, "Lark chat list request");
    chats.push(...(payload.data?.items || []));
    pageToken = payload.data?.page_token || "";
  } while (pageToken);

  return chats.map((chat) => ({
    name: chat.name || chat.chat_name || "",
    chatId: chat.chat_id || chat.chatId || "",
    chatType: chat.chat_type || chat.chatType || "",
    raw: chat,
  }));
}

export async function sendLarkMessage({ text, receiveId, receiveIdType }) {
  const config = getConfig().lark;
  if (!text || typeof text !== "string") {
    throw new Error("Lark message text is required.");
  }

  const targetReceiveId = receiveId || config.receiveId;
  const targetReceiveIdType = receiveIdType || config.receiveIdType;
  const appApiConfigured = Boolean(config.appId && config.appSecret && targetReceiveId);

  if (config.dryRun) {
    return {
      dryRun: true,
      channel: "lark",
      mode: appApiConfigured ? "app_api" : "webhook",
      webhookConfigured: Boolean(config.webhookUrl),
      appApiConfigured,
      receiveIdType: targetReceiveIdType,
      receiveId: targetReceiveId,
      text,
    };
  }

  if (appApiConfigured) {
    const token = await getLarkTenantAccessToken();
    const url = new URL(`${config.apiBaseUrl}/open-apis/im/v1/messages`);
    url.searchParams.set("receive_id_type", targetReceiveIdType);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: targetReceiveId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    });

    return readJsonResponse(response, "Lark app API send request");
  }

  if (!config.webhookUrl) {
    throw new Error("Missing LARK_WEBHOOK_URL or Lark app API target configuration");
  }

  const payload = {
    msg_type: "text",
    content: {
      text,
    },
  };

  if (config.secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    payload.timestamp = timestamp;
    payload.sign = createLarkSign(timestamp, config.secret);
  }

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lark send failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function sendLarkInteractiveCard({ card }) {
  const config = getConfig().lark;
  if (!card || typeof card !== "object") {
    throw new Error("Lark interactive card object is required.");
  }

  const appApiConfigured = Boolean(config.appId && config.appSecret && config.receiveId);

  if (config.dryRun) {
    return {
      dryRun: true,
      channel: "lark",
      mode: appApiConfigured ? "app_api" : "webhook",
      msgType: "interactive",
      receiveIdType: config.receiveIdType,
      receiveId: config.receiveId,
      card,
    };
  }

  if (!appApiConfigured) {
    throw new Error("Lark interactive cards require LARK_APP_ID, LARK_APP_SECRET, and LARK_RECEIVE_ID.");
  }

  const token = await getLarkTenantAccessToken();
  const url = new URL(`${config.apiBaseUrl}/open-apis/im/v1/messages`);
  url.searchParams.set("receive_id_type", config.receiveIdType);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: config.receiveId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    }),
  });

  return readJsonResponse(response, "Lark interactive card send request");
}
