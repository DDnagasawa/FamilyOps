import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_INBOX_PATH = path.join(process.cwd(), "data", "lark_inbox.json");

export function appendLarkInboxMessage(message, inboxPath = DEFAULT_INBOX_PATH) {
  ensureInboxFile(inboxPath);
  const inbox = readLarkInbox(inboxPath);
  const item = {
    id: randomUUID(),
    status: "pending",
    receivedAt: new Date().toISOString(),
    ...message,
  };
  inbox.push(item);
  writeInbox(inbox, inboxPath);
  return item;
}

export function readLarkInbox(inboxPath = DEFAULT_INBOX_PATH) {
  ensureInboxFile(inboxPath);
  return JSON.parse(fs.readFileSync(inboxPath, "utf8"));
}

export function listPendingLarkInbox(inboxPath = DEFAULT_INBOX_PATH) {
  return readLarkInbox(inboxPath).filter((item) => item.status === "pending");
}

export function markLarkInboxMessageProcessed(id, result = {}, inboxPath = DEFAULT_INBOX_PATH) {
  const inbox = readLarkInbox(inboxPath);
  const item = inbox.find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`Lark inbox message not found: ${id}`);
  }
  item.status = "processed";
  item.processedAt = new Date().toISOString();
  item.result = result;
  writeInbox(inbox, inboxPath);
  return item;
}

function ensureInboxFile(inboxPath) {
  fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
  if (!fs.existsSync(inboxPath)) {
    fs.writeFileSync(inboxPath, "[]\n", "utf8");
  }
}

function writeInbox(inbox, inboxPath) {
  fs.writeFileSync(inboxPath, `${JSON.stringify(inbox, null, 2)}\n`, "utf8");
}
