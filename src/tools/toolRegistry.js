export class ToolRegistry {
  constructor({ permissionManager, auditLog, approvalQueue }) {
    this.permissionManager = permissionManager;
    this.auditLog = auditLog;
    this.approvalQueue = approvalQueue;
    this.tools = new Map();
  }

  register(tool) {
    if (!tool?.name || typeof tool.execute !== "function") {
      throw new Error("Tool must include name and execute handler.");
    }
    this.tools.set(tool.name, tool);
  }

  list() {
    return [...this.tools.values()].map(({ execute, ...metadata }) => metadata);
  }

  get(name) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool;
  }

  async execute(name, input, context = {}) {
    const tool = this.get(name);
    const allowedTools = context.allowedTools || [];
    if (allowedTools.length > 0 && !allowedTools.includes(name)) {
      const reason = `Tool ${name} is not allowed for skill ${context.skillName}.`;
      this.auditLog.write({
        agentRunId: context.agentRunId,
        skill: context.skillName,
        tool: name,
        inputSummary: input,
        riskLevel: tool.riskLevel,
        permissionDecision: "blocked",
        status: "blocked",
        error: reason,
      });
      return {
        ok: false,
        status: "blocked",
        riskLevel: tool.riskLevel,
        reason,
      };
    }

    const permission = this.permissionManager.decide(tool, input, context);

    if (permission.decision !== "allowed") {
      let approvalRequest = null;
      if (permission.decision === "approval_required" && this.approvalQueue) {
        approvalRequest = this.approvalQueue.create({
          agentRunId: context.agentRunId,
          skill: context.skillName,
          tool: name,
          riskLevel: tool.riskLevel,
          reason: permission.reason,
          proposedAction: input,
          preview: tool.preview ? tool.preview(input, context) : input,
        });
        if (this.tools.has("send_lark_approval_card") || this.tools.has("send_lark_message")) {
          const notification =
            this.tools.has("send_lark_approval_card") ? this.get("send_lark_approval_card") : this.get("send_lark_message");
          const notificationInput =
            notification.name === "send_lark_approval_card"
              ? { approvalRequest, toolName: name, skillName: context.skillName }
              : {
                  text: formatApprovalNotification({ approvalRequest, toolName: name, skillName: context.skillName }),
                };
          const notificationOutput = await notification.execute(notificationInput, context);
          this.auditLog.write({
            agentRunId: context.agentRunId,
            skill: context.skillName,
            tool: notification.name,
            inputSummary: { approvalId: approvalRequest.id },
            outputSummary: notificationOutput,
            riskLevel: notification.riskLevel,
            permissionDecision: "allowed",
            status: "approval_notification_sent",
          });
        }
      }

      this.auditLog.write({
        agentRunId: context.agentRunId,
        skill: context.skillName,
        tool: name,
        inputSummary: input,
        riskLevel: tool.riskLevel,
        permissionDecision: permission.decision,
        status: permission.decision,
        error: permission.reason,
      });

      return {
        ok: false,
        status: permission.decision,
        riskLevel: tool.riskLevel,
        reason: permission.reason,
        approvalRequest,
      };
    }

    try {
      const output = await tool.execute(input, context);
      this.auditLog.write({
        agentRunId: context.agentRunId,
        skill: context.skillName,
        tool: name,
        inputSummary: input,
        outputSummary: output,
        riskLevel: tool.riskLevel,
        permissionDecision: permission.decision,
        status: "success",
      });
      return { ok: true, status: "success", output };
    } catch (error) {
      this.auditLog.write({
        agentRunId: context.agentRunId,
        skill: context.skillName,
        tool: name,
        inputSummary: input,
        riskLevel: tool.riskLevel,
        permissionDecision: permission.decision,
        status: "failed",
        error: error.message,
      });
      throw error;
    }
  }
}

function formatPreview(preview) {
  const text = typeof preview === "string" ? preview : JSON.stringify(preview, null, 2);
  return text.length > 700 ? `${text.slice(0, 700)}\n...` : text;
}

function formatApprovalNotification({ approvalRequest, toolName, skillName }) {
  return [
    "Approval Required",
    "",
    `Skill: ${skillName}`,
    `Tool: ${toolName}`,
    `Risk: ${approvalRequest.riskLevel}`,
    `Approval ID: ${approvalRequest.id}`,
    `Reason: ${approvalRequest.reason}`,
    "",
    "Preview:",
    formatPreview(approvalRequest.preview),
    "",
    "Approve:",
    approvalRequest.approveCommand,
    "",
    "Reject:",
    approvalRequest.rejectCommand,
  ].join("\n");
}
