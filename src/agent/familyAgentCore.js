import { randomUUID } from "node:crypto";
import { previewFamilyPlanning } from "../connectors/familyPlanner.js";
import { resolveFamilyReferences } from "../connectors/familyMemberResolver.js";

const FAMILY_AGENT_SKILL = "family_agent_core";

const FAMILY_AGENT_ALLOWED_TOOLS = [
  "read_family_plan",
  "plan_family_affairs",
  "list_family_reminders",
  "list_family_todos",
  "generate_family_suggestions",
  "send_family_todo_card",
  "send_lark_message",
];

export class FamilyAgentCore {
  constructor({ toolRegistry, auditLog, localMemory, memoryLearning, modelAdapter }) {
    this.toolRegistry = toolRegistry;
    this.auditLog = auditLog;
    this.localMemory = localMemory;
    this.memoryLearning = memoryLearning;
    this.modelAdapter = modelAdapter;
  }

  async run(input = {}) {
    const text = String(input.text || "").trim();
    if (!text) throw new Error("Agent input text is required.");

    const agentRunId = randomUUID();
    const context = {
      agentRunId,
      skillName: FAMILY_AGENT_SKILL,
      allowedTools: FAMILY_AGENT_ALLOWED_TOOLS,
    };
    const stages = [];

    this.#record(agentRunId, "started", {
      source: input.source || "unknown",
      textLength: text.length,
    });

    try {
      const observation = this.#observe({ ...input, text });
      stages.push(stage("observe", "completed", observation));

      const recall = await this.#recall(context, input);
      stages.push(stage("recall", "completed", recall.summary));

      const memberResolution = resolveFamilyReferences(text, {
        planMembers: recall.familyPlan.output?.plan?.members || [],
        familyUsers: input.familyUsers || [],
        currentUser: input.currentUser || null,
      });
      stages.push(stage("member_resolution", "completed", {
        matchCount: memberResolution.matches.length,
        matches: memberResolution.matches,
      }));
      const resolvedInput = {
        ...input,
        text: memberResolution.resolvedText,
        originalText: text,
        memberResolution,
      };

      const modelInterpretation = await this.#think(resolvedInput, recall);
      stages.push(
        stage(
          "think",
          modelInterpretation.used ? "completed" : modelInterpretation.status || "skipped",
          summarizeModelInterpretation(modelInterpretation)
        )
      );

      const plannerInput = buildPlannerInput({ input: resolvedInput, modelInterpretation });
      const proposal = this.#plan(plannerInput);
      stages.push(stage("plan", "completed", proposal.summary));

      const privacy = this.#reviewPrivacy(proposal);
      stages.push(stage("privacy", "completed", privacy));

      const execution = modelInterpretation.used && modelInterpretation.needsClarification && !hasExecutableProposal(proposal)
        ? buildSkippedExecution(recall, "Model requested clarification before execution.")
        : await this.#execute(plannerInput, context);
      stages.push(stage("execute", execution.status === "skipped" ? "skipped" : execution.ok ? "completed" : execution.status, summarizeExecution(execution)));

      const suggestions = await this.#suggest({ input: resolvedInput, proposal, recall }, context);
      stages.push(stage("suggest", suggestions.ok ? "completed" : suggestions.status, summarizeSuggestions(suggestions)));

      const reminders = await this.#executeTool("list_family_reminders", { daysAhead: 1 }, context);
      stages.push(stage("remind", reminders.ok ? "completed" : reminders.status, summarizeTool(reminders)));

      const todos = await this.#executeTool("list_family_todos", {}, context);
      stages.push(stage("todo_sync", todos.ok ? "completed" : todos.status, summarizeTool(todos)));

      const reply = buildReply({ proposal, execution, privacy, modelInterpretation, suggestions });
      const result = {
        agentRunId,
        mode: "codex-in-the-loop-local-execution",
        architecture: "Hermes/OpenClaw-inspired execution pipeline",
        observation,
        memory: recall.memory,
        learning: recall.learning,
        modelInterpretation,
        memberResolution,
        proposal,
        privacy,
        execution,
        suggestions,
        reminders,
        todos,
        stages,
        reply,
        report: reply,
      };

      this.#record(agentRunId, "completed", {
        proposedCount: proposal.summary.proposedCount,
        executionStatus: execution.status,
      });
      this.memoryLearning?.recordFeedback?.({
        userId: input.currentUser?.id || "anonymous",
        familyId: input.familyId || "default",
        type: "agent_run_completed",
        targetId: agentRunId,
        metadata: { category: "family_agent" },
        source: input.source || "family_app",
      });
      for (const action of execution.output?.applied || []) {
        if (action.type !== "task" && action.type !== "shopping") continue;
        this.memoryLearning?.recordFeedback?.({
          userId: input.currentUser?.id || "anonymous",
          familyId: input.familyId || "default",
          type: "task_created",
          targetId: action.task?.id || action.item?.id || "",
          metadata: {
            taskType: action.type === "shopping" ? "shopping" : action.task?.category || "family_task",
            category: action.type === "shopping" ? "shopping" : "todo",
            kind: action.type,
          },
          source: input.source || "family_app",
        });
      }
      return result;
    } catch (error) {
      stages.push(stage("failed", "failed", { error: error.message }));
      this.#record(agentRunId, "failed", { error: error.message });
      throw error;
    }
  }

  #observe(input) {
    return {
      source: input.source || "family_app",
      receivedAt: new Date().toISOString(),
      text: input.text,
      textLength: input.text.length,
      wantsLarkDelivery: Boolean(input.sendLark),
    };
  }

  async #recall(context, input = {}) {
    const planResult = await this.#executeTool("read_family_plan", {}, context);
    const memory = this.localMemory?.read?.() || {};
    const learning = this.memoryLearning?.recall?.({
      userId: input.currentUser?.id || "anonymous",
      familyId: input.familyId || "default",
      query: input.text || "",
      includeSensitive: Boolean(input.currentUser),
      limit: 8,
    }) || [];
    return {
      familyPlan: planResult,
      memory: { ...memory, learningRecall: learning },
      learning,
      summary: {
        familyPlanStatus: planResult.status,
        members: planResult.output?.summary?.members || 0,
        openTasks: planResult.output?.summary?.openTasks || 0,
        openShoppingItems: planResult.output?.summary?.openShoppingItems || 0,
        memoryFacts: memory.facts?.length || 0,
        recalledMemories: learning.length,
      },
    };
  }

  #plan(input) {
    return previewFamilyPlanning(input);
  }

  async #think(input, recall) {
    if (!this.modelAdapter) {
      return {
        ok: false,
        used: false,
        provider: "none",
        model: "none",
        status: "skipped",
        reason: "No model adapter is configured.",
        actions: [],
      };
    }
    return this.modelAdapter.interpretFamilyInput({
      ...input,
      familyPlan: recall.familyPlan.output?.plan,
      memory: recall.memory,
    });
  }

  #reviewPrivacy(proposal) {
    return {
      privateItemCount: proposal.summary.privateCount,
      decisions: proposal.privacy,
      policy: proposal.privacy.length
        ? "Private or surprise items use limited recipients and are not sent to excluded members."
        : "No special privacy restriction detected.",
      riskLevel: proposal.riskLevel,
    };
  }

  async #execute(input, context) {
    return this.#executeTool("plan_family_affairs", input, context);
  }

  async #suggest({ input, proposal, recall }, context) {
    return this.#executeTool(
      "generate_family_suggestions",
      {
        text: input.text,
        actions: proposal.actions,
        familyPlan: recall.familyPlan.output?.plan,
        familyUsers: input.familyUsers || [],
        currentUser: input.currentUser || null,
        memory: recall.memory,
        includeWebResults: Boolean(input.includeWebResults),
      },
      context
    );
  }

  async #executeTool(name, input, context) {
    return this.toolRegistry.execute(name, input, context);
  }

  #record(agentRunId, status, payload) {
    this.auditLog?.write?.({
      agentRunId,
      skill: FAMILY_AGENT_SKILL,
      status,
      inputSummary: status === "started" ? payload : undefined,
      outputSummary: status !== "started" ? payload : undefined,
    });
  }
}

function stage(name, status, detail = {}) {
  return {
    name,
    status,
    timestamp: new Date().toISOString(),
    detail,
  };
}

function summarizeExecution(result) {
  return {
    ok: result.ok,
    status: result.status,
    riskLevel: result.riskLevel,
    appliedCount: result.output?.applied?.length || 0,
    skippedCount: result.output?.skipped?.length || 0,
    reason: result.reason,
  };
}

function summarizeTool(result) {
  return {
    ok: result.ok,
    status: result.status,
    riskLevel: result.riskLevel,
    count: result.output?.reminders?.length || result.output?.tasks?.length || 0,
  };
}

function summarizeSuggestions(result) {
  return {
    ok: result.ok,
    status: result.status,
    triggered: Boolean(result.output?.triggered),
    suggestionCount: result.output?.suggestions?.length || 0,
    private: Boolean(result.output?.privacy?.private),
    recipients: result.output?.privacy?.recipients || [],
  };
}

function summarizeModelInterpretation(result) {
  return {
    used: Boolean(result.used),
    provider: result.provider,
    model: result.model,
    actionCount: result.actions?.length || 0,
    confidence: result.confidence || null,
    needsClarification: Boolean(result.needsClarification),
    reason: result.reason || null,
  };
}

function buildPlannerInput({ input, modelInterpretation }) {
  if (modelInterpretation.used && modelInterpretation.actions?.length) {
    return {
      ...input,
      actions: modelInterpretation.actions,
    };
  }
  return input;
}

function buildSkippedExecution(recall, reason) {
  return {
    ok: true,
    status: "skipped",
    riskLevel: "low",
    reason,
    output: {
      applied: [],
      skipped: [],
      planSummary: recall.summary,
    },
  };
}

function buildReply({ proposal, execution, privacy, modelInterpretation, suggestions }) {
  const appliedCount = execution.output?.applied?.length || 0;
  if (modelInterpretation?.used && modelInterpretation.needsClarification && appliedCount === 0) {
    return [
      "我需要再确认一下。",
      modelInterpretation.clarifyingQuestion ? `问题：${modelInterpretation.clarifyingQuestion}` : null,
      "确认前我没有写入 Todo 或日历。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (!execution.ok) {
    return [
      "这次没有执行。",
      execution.reason ? `原因：${execution.reason}` : null,
      execution.approvalRequest ? `需要审批：${execution.approvalRequest.id}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines = ["已通过 agent 执行层处理。"];
  if (proposal.actions.length) {
    for (const action of proposal.actions) {
      if (action.type === "event") lines.push(`事件：${action.title}${action.date ? ` (${action.date})` : ""}`);
      if (action.type === "task") lines.push(`Todo：${action.title}${action.dueDate ? ` (${action.dueDate})` : ""}`);
      if (action.type === "shopping") lines.push(`购物：${action.title}${action.dueDate ? ` (${action.dueDate})` : ""}`);
    }
  } else {
    lines.push("没有识别出新的家庭事项。");
  }
  if (execution.output?.skipped?.length) {
    lines.push(`跳过重复项：${execution.output.skipped.length} 个`);
  }
  if (privacy.privateItemCount > 0) {
    lines.push(`隐私处理：${privacy.privateItemCount} 个事项已限制提醒对象。`);
  }
  if (suggestions && suggestions.output && suggestions.output.report) {
    lines.push(suggestions.output.report);
  }
  return lines.join("\n");
}

function hasExecutableProposal(proposal = {}) {
  return (proposal.actions || []).some((action) => {
    if (action.type === "event") return Boolean(action.title && (action.date || action.dueDate));
    if (action.type === "task") return Boolean(action.title);
    if (action.type === "shopping") return Boolean(action.item || action.title);
    return false;
  });
}
