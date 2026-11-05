import fs from "node:fs";
import path from "node:path";

const DEFAULT_POLICY_PATH = path.join(process.cwd(), "config", "permissions.json");
const RISK_ORDER = ["low", "medium", "high", "critical"];

export class PermissionManager {
  constructor(policyPath = DEFAULT_POLICY_PATH) {
    this.policy = this.#loadPolicy(policyPath);
  }

  decide(tool) {
    const riskLevel = tool.riskLevel || "low";
    if (!RISK_ORDER.includes(riskLevel)) {
      return {
        decision: "blocked",
        reason: `Unknown risk level: ${riskLevel}`,
      };
    }

    if (this.policy.blockedTools.includes(tool.name)) {
      return {
        decision: "blocked",
        reason: `Tool is blocked by permission policy: ${tool.name}`,
      };
    }

    if (this.policy.approvalRequiredTools.includes(tool.name)) {
      return {
        decision: "approval_required",
        reason: `Tool requires approval by permission policy: ${tool.name}`,
      };
    }

    const policyDecision = this.policy.riskPolicy[riskLevel];

    if (policyDecision === "blocked") {
      return {
        decision: "blocked",
        reason: `${riskLevel} risk tools are blocked by permission policy.`,
      };
    }

    if (policyDecision === "approval_required") {
      return {
        decision: "approval_required",
        reason: `${riskLevel} risk tools require user approval.`,
      };
    }

    return {
      decision: "allowed",
      reason: `${riskLevel} risk action is allowed by current policy.`,
    };
  }

  #loadPolicy(policyPath) {
    const fallback = {
      riskPolicy: {
        low: "allowed",
        medium: "allowed",
        high: "approval_required",
        critical: "blocked",
      },
      blockedTools: [],
      approvalRequiredTools: [],
    };

    if (!fs.existsSync(policyPath)) return fallback;
    return {
      ...fallback,
      ...JSON.parse(fs.readFileSync(policyPath, "utf8")),
    };
  }
}
