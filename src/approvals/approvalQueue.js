import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_APPROVAL_PATH = path.join(process.cwd(), "data", "approvals.json");

export class ApprovalQueue {
  constructor({ filePath = DEFAULT_APPROVAL_PATH, auditLog } = {}) {
    this.filePath = filePath;
    this.auditLog = auditLog;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "[]\n", "utf8");
    }
  }

  list(status) {
    const approvals = this.#read();
    return status ? approvals.filter((item) => item.status === status) : approvals;
  }

  create({ agentRunId, skill, tool, riskLevel, reason, proposedAction, preview }) {
    const approvals = this.#read();
    const item = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      agentRunId,
      skill,
      tool,
      riskLevel,
      reason,
      proposedAction,
      preview,
      status: "pending",
      approveCommand: null,
      rejectCommand: null,
      decidedAt: null,
      decisionReason: null,
    };
    item.approveCommand = `node src/cli.js approve ${item.id} "approved"`;
    item.rejectCommand = `node src/cli.js reject ${item.id} "rejected"`;
    approvals.push(item);
    this.#write(approvals);
    this.auditLog?.write({
      agentRunId,
      skill,
      tool,
      riskLevel,
      status: "approval_created",
      approvalStatus: "pending",
      outputSummary: item,
    });
    return item;
  }

  approve(id, decisionReason = "") {
    return this.#decide(id, "approved", decisionReason);
  }

  reject(id, decisionReason = "") {
    return this.#decide(id, "rejected", decisionReason);
  }

  #decide(id, status, decisionReason) {
    const approvals = this.#read();
    const item = approvals.find((approval) => approval.id === id);
    if (!item) throw new Error(`Approval request not found: ${id}`);
    if (item.status !== "pending") {
      throw new Error(`Approval request ${id} is already ${item.status}`);
    }

    item.status = status;
    item.decidedAt = new Date().toISOString();
    item.decisionReason = decisionReason;
    this.#write(approvals);
    this.auditLog?.write({
      agentRunId: item.agentRunId,
      skill: item.skill,
      tool: item.tool,
      riskLevel: item.riskLevel,
      status: `approval_${status}`,
      approvalStatus: status,
      outputSummary: item,
    });
    return item;
  }

  #read() {
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  #write(approvals) {
    fs.writeFileSync(this.filePath, `${JSON.stringify(approvals, null, 2)}\n`, "utf8");
  }
}
