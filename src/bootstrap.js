import { getConfig, loadEnv } from "./config/env.js";
import { AuditLog } from "./logging/auditLog.js";
import { PermissionManager } from "./permissions/permissionManager.js";
import { ApprovalQueue } from "./approvals/approvalQueue.js";
import { SkillRegistry } from "./skills/skillRegistry.js";
import { ToolRegistry } from "./tools/toolRegistry.js";
import { AgentRuntime } from "./runtime/agentRuntime.js";
import { FamilyAgentCore } from "./agent/familyAgentCore.js";
import { ModelAdapter } from "./model/modelAdapter.js";
import { RunHistory } from "./runtime/runHistory.js";
import { TaskQueue } from "./runtime/taskQueue.js";
import { Scheduler } from "./runtime/scheduler.js";
import { LocalMemory } from "./memory/localMemory.js";
import { MemoryLearningLayer } from "./memory/memoryLearningLayer.js";
import { AgentProfiles } from "./profiles/agentProfiles.js";
import { ConnectorRegistry } from "./connectors/connectorRegistry.js";
import { registerBuiltInConnectors } from "./connectors/builtInConnectors.js";
import { registerBuiltInTools } from "./tools/builtInTools.js";
import { skillHandlers } from "./skills/builtInSkills.js";
import { loadSkillsFromDisk } from "./skills/dynamicSkillLoader.js";

export function createApp() {
  loadEnv();
  const config = getConfig();
  const auditLog = new AuditLog();
  const permissionManager = new PermissionManager();
  const approvalQueue = new ApprovalQueue({ auditLog });
  const runHistory = new RunHistory();
  const localMemory = new LocalMemory();
  const memoryLearning = new MemoryLearningLayer();
  const agentProfiles = new AgentProfiles();
  const connectorRegistry = new ConnectorRegistry();
  registerBuiltInConnectors(connectorRegistry);
  const toolRegistry = new ToolRegistry({ permissionManager, auditLog, approvalQueue });
  const skillRegistry = new SkillRegistry();
  const modelAdapter = new ModelAdapter({ config: config.model });

  registerBuiltInTools(toolRegistry);
  for (const skill of loadSkillsFromDisk({ handlers: skillHandlers })) {
    skillRegistry.register(skill);
  }

  const runtime = new AgentRuntime({
    skillRegistry,
    toolRegistry,
    auditLog,
    approvalQueue,
  });
  const familyAgent = new FamilyAgentCore({
    toolRegistry,
    auditLog,
    localMemory,
    memoryLearning,
    modelAdapter,
  });
  const taskQueue = new TaskQueue({
    runHistory,
    failureNotifier: ({ task, error }) =>
      toolRegistry.execute(
        "send_lark_message",
        {
          text: [
            "Agent Scheduled Task Failed",
            "",
            `Job: ${task.jobName || "unknown"}`,
            `Skill: ${task.skillName || "unknown"}`,
            `Source: ${task.source || "unknown"}`,
            `Error: ${error.message}`,
          ].join("\n"),
        },
        {
          agentRunId: "scheduler-failure",
          skillName: "scheduler",
        }
      ),
  });
  const scheduler = new Scheduler({ runtime, taskQueue });

  scheduler.registerJob({
    name: "daily_briefing",
    skillName: "daily_briefing",
    input: { sendLark: false },
    shouldRun: () => true,
  });

  return {
    config,
    auditLog,
    approvalQueue,
    permissionManager,
    toolRegistry,
    skillRegistry,
    runtime,
    runHistory,
    localMemory,
    memoryLearning,
    modelAdapter,
    agentProfiles,
    connectorRegistry,
    familyAgent,
    taskQueue,
    scheduler,
  };
}
