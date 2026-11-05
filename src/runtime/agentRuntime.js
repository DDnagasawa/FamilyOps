import { randomUUID } from "node:crypto";

export class AgentRuntime {
  constructor({ skillRegistry, toolRegistry, auditLog }) {
    this.skillRegistry = skillRegistry;
    this.toolRegistry = toolRegistry;
    this.auditLog = auditLog;
  }

  async runSkill(skillName, input = {}) {
    const skill = this.skillRegistry.get(skillName);
    const agentRunId = randomUUID();
    const started = this.auditLog.write({
      agentRunId,
      skill: skillName,
      status: "started",
      inputSummary: input,
    });

    try {
      const scopedTools = {
        execute: (name, toolInput, toolContext = {}) =>
          this.toolRegistry.execute(name, toolInput, {
            ...toolContext,
            agentRunId,
            skillName,
            allowedTools: skill.allowedTools || [],
          }),
      };
      const result = await skill.run({
        input,
        agentRunId,
        skillName,
        tools: scopedTools,
      });

      this.auditLog.write({
        agentRunId,
        skill: skillName,
        status: "completed",
        outputSummary: result,
      });

      return {
        agentRunId,
        startedAt: started.timestamp,
        skill: skillName,
        result,
      };
    } catch (error) {
      this.auditLog.write({
        agentRunId,
        skill: skillName,
        status: "failed",
        error: error.message,
      });
      throw error;
    }
  }
}
