#!/usr/bin/env node
import { createApp } from "./bootstrap.js";
import { generateDashboard } from "./dashboard/generateDashboard.js";
import { listLarkBotChats } from "./connectors/lark.js";
import { listPendingLarkInbox, markLarkInboxMessageProcessed, readLarkInbox } from "./connectors/larkInbox.js";
import { generateCallbackLaunchdPlist, generateLaunchdPlist } from "./runtime/generateLaunchdPlist.js";
import { getCodexTaskPrompt, listCodexTaskPrompts } from "./codex/codexTaskPrompts.js";
import { startCallbackServer } from "./server/callbackServer.js";
import { startAppServer } from "./server/appServer.js";

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON input: ${error.message}`);
  }
}

function parseJsonOrString(value) {
  if (value === undefined) return "";
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function main() {
  const app = createApp();
  const [, , command, target, rawInput] = process.argv;

  if (!command || command === "help") {
    console.log([
      "Codex General Local Agent MVP",
      "",
      "Commands:",
      "  node src/cli.js skills",
      "  node src/cli.js tools",
      "  node src/cli.js run <skillName> '{\"sendLark\":false}'",
      "  node src/cli.js run family_coordinator '{\"text\":\"Lisa football match on 2026-09-05; John buy milk\",\"sendLark\":true}'",
      "  node src/cli.js run family_coordinator '{\"text\":\"todo 今天我要去健身；今天晚上我要去聚会\",\"sendLark\":false}'",
      "  node src/cli.js run family_todo_list",
      "  node src/cli.js tool <toolName> '{\"text\":\"hello\"}'",
      "  node src/cli.js approvals",
      "  node src/cli.js approve <approvalId> 'optional reason'",
      "  node src/cli.js reject <approvalId> 'optional reason'",
      "  node src/cli.js jobs",
      "  node src/cli.js daemon --once",
      "  node src/cli.js history",
      "  node src/cli.js profiles",
      "  node src/cli.js memory",
      "  node src/cli.js memory:set preferences.briefingTone concise",
      "  node src/cli.js memory:learning",
      "  node src/cli.js memory:review",
      "  node src/cli.js connectors",
      "  node src/cli.js validate lark",
      "  node src/cli.js validate github",
      "  node src/cli.js lark chats",
      "  node src/cli.js lark:inbox",
      "  node src/cli.js lark:pending",
      "  node src/cli.js lark:processed <inboxMessageId>",
      "  node src/cli.js codex:prompts",
      "  node src/cli.js codex:prompt daily_briefing",
      "  node src/cli.js dashboard",
      "  node src/cli.js launchd:plist",
      "  node src/cli.js launchd:callback-plist",
      "  node src/cli.js callback:server",
      "  node src/cli.js app:server",
      "  node src/cli.js logs",
      "",
      "Examples:",
      "  npm run briefing",
      "  npm run project",
      "  npm run family:plan -- '{\"text\":\"Lisa football match on 2026-09-05; John buy milk\"}'",
      "  npm run family:todo",
      "  node src/cli.js run social_post_draft '{\"text\":\"Draft this post\"}'",
    ].join("\n"));
    return;
  }

  if (command === "skills") {
    printJson(app.skillRegistry.list());
    return;
  }

  if (command === "tools") {
    printJson(app.toolRegistry.list());
    return;
  }

  if (command === "logs") {
    printJson(app.auditLog.list());
    return;
  }

  if (command === "history") {
    printJson(app.runHistory.list());
    return;
  }

  if (command === "jobs") {
    printJson(app.scheduler.listJobs());
    return;
  }

  if (command === "profiles") {
    printJson(app.agentProfiles.list());
    return;
  }

  if (command === "memory") {
    printJson(app.localMemory.read());
    return;
  }

  if (command === "memory:set") {
    if (!target) throw new Error("Missing memory key path.");
    const value = parseJsonOrString(rawInput);
    const result = app.localMemory.setByPath(target, value);
    app.auditLog.write({
      agentRunId: "manual-memory-set",
      skill: "manual",
      tool: "memory:set",
      riskLevel: "low",
      permissionDecision: "allowed",
      status: "success",
      inputSummary: { keyPath: target, value },
    });
    printJson(result);
    return;
  }

  if (command === "memory:learning") {
    printJson({ settings: app.memoryLearning.getSettings(), candidates: app.memoryLearning.listCandidates() });
    return;
  }

  if (command === "memory:review") {
    printJson(app.memoryLearning.runReview({ force: true }));
    return;
  }

  if (command === "connectors") {
    printJson(app.connectorRegistry.list());
    return;
  }

  if (command === "lark") {
    if (target !== "chats") {
      throw new Error("Unknown lark command. Use: node src/cli.js lark chats");
    }
    const chats = await listLarkBotChats();
    printJson({
      count: chats.length,
      chats: chats.map((chat) => ({
        name: chat.name,
        chat_id: chat.chatId,
        chat_type: chat.chatType,
      })),
    });
    return;
  }

  if (command === "lark:inbox") {
    printJson(readLarkInbox());
    return;
  }

  if (command === "lark:pending") {
    printJson(listPendingLarkInbox());
    return;
  }

  if (command === "lark:processed") {
    if (!target) throw new Error("Missing Lark inbox message id.");
    printJson(markLarkInboxMessageProcessed(target, { note: rawInput || "processed from CLI" }));
    return;
  }

  if (command === "codex:prompts") {
    printJson(listCodexTaskPrompts());
    return;
  }

  if (command === "codex:prompt") {
    printJson(getCodexTaskPrompt(target || "daily_briefing"));
    return;
  }

  if (command === "validate") {
    if (!target) throw new Error("Missing connector name.");
    const connector = app.connectorRegistry.get(target);
    printJson(connector.validate ? connector.validate() : { ok: true, status: connector.status });
    return;
  }

  if (command === "dashboard") {
    const dashboardPath = generateDashboard({
      skills: app.skillRegistry.list(),
      tools: app.toolRegistry.list(),
      approvals: app.approvalQueue.list(),
      history: app.runHistory.list(),
      connectors: app.connectorRegistry.list(),
      logs: app.auditLog.list(),
    });
    printJson({ dashboardPath });
    return;
  }

  if (command === "launchd:plist") {
    printJson({ plistPath: generateLaunchdPlist() });
    return;
  }

  if (command === "launchd:callback-plist") {
    printJson({ plistPath: generateCallbackLaunchdPlist() });
    return;
  }

  if (command === "callback:server") {
    startCallbackServer();
    return;
  }

  if (command === "app:server") {
    startAppServer();
    return;
  }

  if (command === "daemon") {
    if (target === "--once") {
      printJson(await app.scheduler.runDueJobsOnce());
      return;
    }
    console.log("Starting local agent daemon. Press Ctrl+C to stop.");
    app.scheduler.start();
    return;
  }

  if (command === "approvals") {
    printJson(app.approvalQueue.list(target));
    return;
  }

  if (command === "approve") {
    if (!target) throw new Error("Missing approval id.");
    printJson(app.approvalQueue.approve(target, rawInput || ""));
    return;
  }

  if (command === "reject") {
    if (!target) throw new Error("Missing approval id.");
    printJson(app.approvalQueue.reject(target, rawInput || ""));
    return;
  }

  if (command === "run") {
    if (!target) throw new Error("Missing skill name.");
    const input = parseJson(rawInput);
    const result = await app.runtime.runSkill(target, input);
    printJson(result);
    return;
  }

  if (command === "tool") {
    if (!target) throw new Error("Missing tool name.");
    const input = parseJson(rawInput);
    const result = await app.toolRegistry.execute(target, input, {
      agentRunId: "manual-tool-run",
      skillName: "manual",
    });
    printJson(result);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
