import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/bootstrap.js";
import { deleteFamilyTodo, expandRecurringEvents, listFamilyReminders, planFamilyAffairs, previewFamilyPlanning } from "../src/connectors/familyPlanner.js";
import { FamilyAgentCore } from "../src/agent/familyAgentCore.js";
import { ModelAdapter } from "../src/model/modelAdapter.js";

process.env.LARK_DRY_RUN = "true";
process.env.AI_PROVIDER = "codex_in_the_loop";

const app = createApp();
const now = new Date();
now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
const todayIso = now.toISOString().slice(0, 10);

const skills = app.skillRegistry.list().map((skill) => skill.name);
assert.ok(skills.includes("daily_briefing"));
assert.ok(skills.includes("project_summary"));
assert.ok(skills.includes("social_post_draft"));
assert.ok(skills.includes("social_media_draft"));
assert.ok(skills.includes("project_task_update"));
assert.ok(skills.includes("family_reminder"));
assert.ok(skills.includes("family_coordinator"));
assert.ok(skills.includes("family_todo_list"));
assert.ok(skills.includes("research_summary"));
assert.ok(skills.includes("web_research_report"));
assert.ok(skills.includes("local_file_organisation"));
assert.ok(skills.includes("folder_monitoring"));
assert.ok(skills.includes("project_management_sync"));
assert.ok(skills.includes("local_script_execution"));
assert.ok(skills.includes("social_media_publishing_request"));
assert.ok(skills.includes("github_project_summary"));
assert.ok(skills.includes("github_public_project_summary"));
assert.ok(skills.includes("rss_news_briefing"));

const tools = app.toolRegistry.list().map((tool) => tool.name);
assert.ok(tools.includes("read_context"));
assert.ok(tools.includes("read_family_plan"));
assert.ok(tools.includes("plan_family_affairs"));
assert.ok(tools.includes("list_family_todos"));
assert.ok(tools.includes("list_family_reminders"));
assert.ok(tools.includes("generate_family_suggestions"));
assert.ok(tools.includes("complete_family_todo"));
assert.ok(tools.includes("send_family_todo_card"));
assert.ok(tools.includes("send_lark_message"));
assert.ok(tools.includes("publish_social_post"));
assert.ok(tools.includes("update_project_task"));
assert.ok(tools.includes("delete_important_file"));
assert.ok(tools.includes("request_approval"));
assert.ok(tools.includes("search_web"));
assert.ok(tools.includes("open_web_page"));
assert.ok(tools.includes("extract_page_text"));
assert.ok(tools.includes("organize_local_files"));
assert.ok(tools.includes("run_local_script"));
assert.ok(tools.includes("scan_folder_changes"));
assert.ok(tools.includes("sync_project_context"));
assert.ok(tools.includes("enqueue_social_post"));
assert.ok(tools.includes("read_github_repository"));
assert.ok(tools.includes("read_github_issues"));
assert.ok(tools.includes("read_github_pull_requests"));
assert.ok(tools.includes("read_github_commits"));
assert.ok(tools.includes("read_github_project_summary"));
assert.ok(tools.includes("read_github_public_project_summary"));
assert.ok(tools.includes("read_rss_news"));
assert.ok(tools.includes("send_lark_interactive_card"));
assert.ok(tools.includes("send_lark_approval_card"));

const briefing = await app.runtime.runSkill("daily_briefing", { sendLark: false });
assert.match(briefing.result.briefing, /Daily Briefing/);

const project = await app.runtime.runSkill("project_summary", { sendLark: false });
assert.match(project.result.summary, /Project Summary/);

const family = await app.runtime.runSkill("family_reminder", { sendLark: false });
assert.match(family.result.reminder, /Family Reminder/);

const familyPlan = await app.runtime.runSkill("family_coordinator", {
  text: "Lisa football match on 2026-09-05; John buy milk by 2026-09-01; surprise birthday for Lisa on 2026-09-10",
  sendLark: false,
});
assert.match(familyPlan.result.report, /Family Agent Update/);
assert.ok(
  familyPlan.result.planning.output.applied.length + familyPlan.result.planning.output.skipped.length >= 2
);

const uniqueTodoLabel = `测试待办${Date.now()}`;
const naturalTodo = await app.runtime.runSkill("family_coordinator", {
  text: `todo 今天我要${uniqueTodoLabel}`,
  sendLark: false,
});
assert.match(naturalTodo.result.report, /Family Agent Update/);
assert.ok(naturalTodo.result.planning.output.applied.some((item) => item.type === "task"));

const dueFamilyReminder = await app.runtime.runSkill("family_reminder", { sendLark: false });
assert.match(dueFamilyReminder.result.reminder, new RegExp(uniqueTodoLabel));
assert.ok(dueFamilyReminder.result.familyReminders.reminders.length >= 1);

const smartSuggestions = await app.toolRegistry.execute(
  "generate_family_suggestions",
  {
    text: "不要告诉 Thomas，帮我推荐 Thomas 生日礼物",
    familyPlan: {
      members: [
        { name: "Mr Beecham", role: "parent" },
        { name: "John", role: "adult" },
        { name: "Thomas", role: "child", aliases: ["tom"] },
      ],
    },
    memory: { facts: [{ fact: "Thomas likes football" }] },
    includeWebResults: false,
  },
  {
    agentRunId: "test-family-suggestions",
    skillName: "manual",
  }
);
assert.equal(smartSuggestions.ok, true);
assert.equal(smartSuggestions.output.triggered, true);
assert.equal(smartSuggestions.output.privacy.private, true);
assert.ok(smartSuggestions.output.privacy.recipients.includes("Mr Beecham"));
assert.ok(smartSuggestions.output.privacy.recipients.includes("John"));
assert.ok(!smartSuggestions.output.privacy.recipients.includes("Thomas"));
assert.match(smartSuggestions.output.suggestions[0].links[0].url, /amazon\.com/);

const mrBirthdaySuggestions = await app.toolRegistry.execute(
  "generate_family_suggestions",
  {
    text: "Mr Beecham birthday dinner and gift",
    familyPlan: {
      members: [
        { name: "Mr Beecham", role: "parent", aliases: ["dad", "daddy", "father"] },
        { name: "Mrs Beecham", role: "parent", aliases: ["mum", "mother"] },
        { name: "John", role: "adult" },
      ],
    },
    familyUsers: [
      {
        displayName: "Mr Beecham",
        nickname: "Daddy",
        familyRole: "father",
        isAdult: true,
        birthday: "1975-11-08",
      },
      {
        displayName: "Mrs Beecham",
        nickname: "Mum",
        familyRole: "mother",
        isAdult: true,
      },
    ],
    includeWebResults: false,
  },
  {
    agentRunId: "test-mr-birthday-suggestions",
    skillName: "manual",
  }
);
assert.equal(mrBirthdaySuggestions.output.privacy.private, true);
assert.ok(!mrBirthdaySuggestions.output.privacy.recipients.includes("Mr Beecham"));
assert.ok(mrBirthdaySuggestions.output.privacy.recipients.includes("Mrs Beecham"));
assert.ok(mrBirthdaySuggestions.output.suggestions[0].excludedMembers.includes("Mr Beecham"));
assert.equal(mrBirthdaySuggestions.output.suggestions[0].surpriseCategory, "birthday");

const surpriseCases = [
  ["birthday", "Mr Beecham birthday"],
  ["anniversary", "Mr Beecham anniversary dinner"],
  ["gift", "buy gift for Mr Beecham"],
  ["surprise_party", "surprise party for Mr Beecham"],
  ["date_or_meal", "restaurant dinner for Mr Beecham"],
  ["trip_or_ticket", "theme park ticket for Mr Beecham"],
];
for (const [category, text] of surpriseCases) {
  const result = await app.toolRegistry.execute(
    "generate_family_suggestions",
    {
      text,
      familyPlan: {
        members: [
          { name: "Mr Beecham", role: "parent", aliases: ["dad", "daddy", "father"] },
          { name: "Mrs Beecham", role: "parent", aliases: ["mum", "mother"] },
          { name: "John", role: "adult" },
        ],
      },
      includeWebResults: false,
    },
    {
      agentRunId: `test-surprise-${category}`,
      skillName: "manual",
    }
  );
  assert.equal(result.output.suggestions[0].surpriseCategory, category);
  assert.ok(!result.output.privacy.recipients.includes("Mr Beecham"));
  assert.ok(result.output.suggestions[0].excludedMembers.includes("Mr Beecham"));
}

const suggestionOnlyPreview = previewFamilyPlanning({ text: "不要告诉 Thomas，帮我推荐 Thomas 生日礼物" });
assert.equal(suggestionOnlyPreview.summary.proposedCount, 0);

const childCalendarSyncPreview = previewFamilyPlanning({
  text: "Thomas football match on 2026-09-05",
});
const childCalendarEvent = childCalendarSyncPreview.actions.find((action) => action.type === "event");
assert.ok(childCalendarEvent);
assert.deepEqual(childCalendarEvent.calendarSync.children, ["Thomas"]);
assert.ok(childCalendarEvent.calendarSync.parents.includes("Mr Beecham"));
assert.ok(childCalendarEvent.calendarSync.parents.includes("Mrs Beecham"));
assert.ok(childCalendarEvent.recipients.includes("Thomas"));
assert.ok(childCalendarEvent.recipients.includes("Mr Beecham"));
assert.ok(childCalendarEvent.recipients.includes("Mrs Beecham"));

const surpriseChildCalendarPreview = previewFamilyPlanning({
  text: "surprise birthday for Lisa on 2026-09-10",
});
const surpriseChildEvent = surpriseChildCalendarPreview.actions.find((action) => action.type === "event");
assert.ok(surpriseChildEvent);
assert.equal(surpriseChildEvent.calendarSync, undefined);
assert.ok(!surpriseChildEvent.recipients.includes("Lisa"));

const weeklyFootballPreview = previewFamilyPlanning({
  text: "John football 每周四",
});
const weeklyFootballEvent = weeklyFootballPreview.actions.find((action) => action.type === "event");
assert.ok(weeklyFootballEvent);
assert.match(weeklyFootballEvent.date, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(weeklyFootballEvent.recurrence.frequency, "weekly");
assert.equal(weeklyFootballEvent.recurrence.weekday, 4);
assert.ok(weeklyFootballEvent.recipients.includes("John"));

const modelMissingDatePreview = previewFamilyPlanning({
  text: "John football 每周四",
  actions: [
    {
      type: "task",
      title: "John football",
      participants: ["John"],
    },
  ],
});
const modelMissingDateEvent = modelMissingDatePreview.actions[0];
assert.equal(modelMissingDateEvent.type, "event");
assert.match(modelMissingDateEvent.date, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(modelMissingDateEvent.recurrence.weekday, 4);

const recurringSourcePlan = {
  members: [],
  events: [{
    id: "weekly-john-football",
    title: "John football",
    date: "2026-10-01",
    recurrence: { frequency: "weekly", weekday: 4, label: "每周四" },
    recipients: ["John"],
  }],
  tasks: [],
  shopping: [],
  decisions: [],
};
const recurringExpanded = expandRecurringEvents(recurringSourcePlan, {
  from: "2026-10-01",
  to: "2026-11-05",
});
assert.deepEqual(recurringExpanded.events.map((event) => event.date), [
  "2026-10-01",
  "2026-10-08",
  "2026-10-15",
  "2026-10-22",
  "2026-10-29",
  "2026-11-05",
]);
assert.equal(recurringExpanded.events[1].seriesId, "weekly-john-football");
assert.equal(recurringExpanded.events[1].isOccurrence, true);
assert.equal(recurringSourcePlan.events.length, 1);

const duplicatePlanDir = fs.mkdtempSync(path.join(os.tmpdir(), "family-event-dedupe-"));
const duplicatePlanPath = path.join(duplicatePlanDir, "family_plan.json");
const duplicatePlan = {
  members: [{ name: "John", role: "adult", aliases: ["john"] }],
  events: [{
    id: "existing-weekly-football",
    title: "足球训练/比赛",
    date: "2026-10-01",
    participants: ["John"],
    recurrence: { frequency: "weekly", weekday: 4, label: "每周四" },
    excludeMembers: [],
    private: false,
  }],
  tasks: [],
  shopping: [],
  decisions: [],
};
fs.writeFileSync(duplicatePlanPath, `${JSON.stringify(duplicatePlan, null, 2)}\n`, "utf8");
const repeatedEvent = planFamilyAffairs({
  actions: [{
    type: "event",
    title: "John football practice",
    date: "2026-10-08",
    participants: ["John"],
    recurrence: { frequency: "weekly", weekday: 4, label: "每周四" },
  }],
}, duplicatePlanPath);
assert.equal(repeatedEvent.applied.length, 0);
assert.equal(repeatedEvent.skipped[0].reason, "duplicate_event");
assert.equal(JSON.parse(fs.readFileSync(duplicatePlanPath, "utf8")).events.length, 1);

const differentOneTimeEvent = planFamilyAffairs({
  actions: [{
    type: "event",
    title: "John dentist appointment",
    date: "2026-10-08",
    participants: ["John"],
  }],
}, duplicatePlanPath);
assert.equal(differentOneTimeEvent.applied.length, 1);

const todoCard = await app.runtime.runSkill("family_todo_list", {});
assert.match(todoCard.result.report, /Family Todo List card created/);
assert.equal(todoCard.result.todos.ok, true);
assert.equal(todoCard.result.delivery.msgType, "interactive");

const openTodos = await app.toolRegistry.execute(
  "list_family_todos",
  {},
  {
    agentRunId: "test-list-family-todos",
    skillName: "manual",
  }
);
const todoToComplete = openTodos.output.tasks[0] || openTodos.output.shopping[0];
assert.ok(todoToComplete);
const completedTodo = await app.toolRegistry.execute(
  "complete_family_todo",
  { kind: openTodos.output.tasks[0] ? "task" : "shopping", id: todoToComplete.id },
  {
    agentRunId: "test-complete-family-todo",
    skillName: "manual",
  }
);
assert.equal(completedTodo.ok, true);
assert.equal(completedTodo.output.item.status, "done");

const research = await app.runtime.runSkill("research_summary", { topic: "General local agent platform" });
assert.match(research.result.summary, /Research Summary/);

const socialDraft = await app.runtime.runSkill("social_media_draft", { topic: "Codex local agent" });
assert.match(socialDraft.result.draft, /Draft social post/);

const taskUpdate = await app.runtime.runSkill("project_task_update", {
  projectName: "General Agent Platform",
  taskTitle: "Add approval queue",
  status: "done",
});
assert.equal(taskUpdate.result.update.output.status, "done");

const highRisk = await app.runtime.runSkill("social_post_draft", {
  text: "This should not publish without approval.",
});
assert.equal(highRisk.result.publishAttempt.ok, false);
assert.equal(highRisk.result.publishAttempt.status, "approval_required");
assert.ok(highRisk.result.publishAttempt.approvalRequest.id);

const approvals = app.approvalQueue.list("pending");
assert.ok(approvals.some((approval) => approval.id === highRisk.result.publishAttempt.approvalRequest.id));

const blockedBySkill = await app.toolRegistry.execute(
  "send_lark_message",
  { text: "Should be blocked by per-skill allowed tools" },
  {
    agentRunId: "test-allowed-tools",
    skillName: "restricted_skill",
    allowedTools: ["read_context"],
  }
);
assert.equal(blockedBySkill.ok, false);
assert.equal(blockedBySkill.status, "blocked");

const critical = await app.toolRegistry.execute(
  "delete_important_file",
  { path: "/important/file.txt" },
  {
    agentRunId: "test-critical-tool",
    skillName: "manual",
  }
);
assert.equal(critical.ok, false);
assert.equal(critical.status, "blocked");

const jobs = app.scheduler.listJobs();
assert.ok(jobs.some((job) => job.name === "daily_briefing"));

const scheduled = await app.scheduler.runDueJobsOnce();
assert.ok(scheduled.length >= 1);
assert.equal(scheduled[0].status, "success");

const history = app.runHistory.list();
assert.ok(history.length >= 1);

assert.ok(app.agentProfiles.list().some((profile) => profile.id === "default"));
assert.equal(app.localMemory.read().preferences.defaultPushChannel, "lark");
assert.ok(app.connectorRegistry.list().some((connector) => connector.name === "lark"));
assert.ok(app.connectorRegistry.list().some((connector) => connector.name === "rss_news"));
assert.ok(app.connectorRegistry.list().some((connector) => connector.name === "github_public"));
assert.ok(app.connectorRegistry.list().some((connector) => connector.name === "lark_callback_server"));
assert.equal(app.connectorRegistry.get("lark").validate().ok, true);

const preview = previewFamilyPlanning({ text: "明天提醒 John 买测试牛奶" });
assert.equal(preview.actions[0].type, "shopping");
assert.equal(preview.summary.proposedCount, 1);

const defaultModelInterpretation = await app.modelAdapter.interpretFamilyInput({
  text: "今天晚上8点提醒我去健身",
});
assert.equal(defaultModelInterpretation.used, false);
assert.equal(defaultModelInterpretation.provider, "codex_in_the_loop");

const fakeOpenAIAdapter = new ModelAdapter({
  config: {
    provider: "openai",
    openaiKey: "test-key",
    openaiModel: "test-model",
  },
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        output_text: JSON.stringify({
          actions: [
            {
              type: "task",
              title: "模型理解测试",
              dueDate: todayIso,
              category: "health",
              priority: "normal",
            },
          ],
          confidence: 0.9,
          needsClarification: false,
        }),
      });
    },
  }),
});
const fakeOpenAIInterpretation = await fakeOpenAIAdapter.interpretFamilyInput({
  text: "今晚提醒我去健身",
});
assert.equal(fakeOpenAIInterpretation.used, true);
assert.equal(fakeOpenAIInterpretation.actions[0].type, "task");
assert.equal(fakeOpenAIInterpretation.actions[0].title, "模型理解测试");

let doubaoRequest = null;
const fakeDoubaoAdapter = new ModelAdapter({
  config: {
    provider: "doubao",
    arkKey: "test-ark-key",
    arkModel: "doubao-test-model",
    arkBaseUrl: "https://ark.example.test/api/v3",
  },
  fetchImpl: async (url, options) => {
    doubaoRequest = { url, body: JSON.parse(options.body), auth: options.headers.Authorization };
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  actions: [
                    {
                      type: "shopping",
                      item: "豆包牛奶",
                      assignee: "John",
                      dueDate: todayIso,
                    },
                  ],
                  confidence: 0.92,
                  needsClarification: false,
                }),
              },
            },
          ],
        });
      },
    };
  },
});
const fakeDoubaoInterpretation = await fakeDoubaoAdapter.interpretFamilyInput({
  text: "提醒 John 买牛奶",
});
assert.equal(fakeDoubaoInterpretation.used, true);
assert.equal(fakeDoubaoInterpretation.provider, "doubao");
assert.equal(fakeDoubaoInterpretation.actions[0].type, "shopping");
assert.equal(fakeDoubaoInterpretation.actions[0].item, "豆包牛奶");
assert.equal(doubaoRequest.url, "https://ark.example.test/api/v3/chat/completions");
assert.equal(doubaoRequest.auth, "Bearer test-ark-key");
assert.equal(doubaoRequest.body.model, "doubao-test-model");
assert.equal(doubaoRequest.body.response_format.type, "json_object");

const fakeDoubaoAnonymousInterpretation = await fakeDoubaoAdapter.interpretFamilyInput({
  text: "John football 每周四",
  currentUser: null,
  familyPlan: {
    members: [{ name: "John", role: "adult" }],
    tasks: [],
    shopping: [],
  },
});
assert.equal(fakeDoubaoAnonymousInterpretation.used, true);

const agentTurn = await app.familyAgent.run({
  text: `todo 今天我要AgentCore测试${Date.now()}`,
  source: "smoke_test",
  sendLark: false,
});
assert.equal(agentTurn.architecture, "Hermes/OpenClaw-inspired execution pipeline");
assert.ok(agentTurn.stages.some((item) => item.name === "observe" && item.status === "completed"));
assert.ok(agentTurn.stages.some((item) => item.name === "execute" && item.status === "completed"));
assert.ok(agentTurn.stages.some((item) => item.name === "suggest"));
assert.match(agentTurn.reply, /agent 执行层/);
const agentCoreTask = agentTurn.execution.output.applied.find((item) => item.type === "task")?.task;
if (agentCoreTask) deleteFamilyTodo({ kind: "task", id: agentCoreTask.id });

const modelTaskTitle = `模型Adapter集成测试${Date.now()}`;
const fakeModelAgent = new FamilyAgentCore({
  toolRegistry: app.toolRegistry,
  auditLog: app.auditLog,
  localMemory: app.localMemory,
  modelAdapter: {
    async interpretFamilyInput() {
      return {
        ok: true,
        used: true,
        provider: "test_model",
        model: "fake-family-model",
        confidence: 0.95,
        needsClarification: false,
        actions: [
          {
            type: "task",
            title: modelTaskTitle,
            dueDate: todayIso,
            category: "family",
            priority: "normal",
          },
        ],
      };
    },
  },
});
const modelAgentTurn = await fakeModelAgent.run({
  text: "这是一句本地规则不好理解的话",
  source: "smoke_test_model_adapter",
  sendLark: false,
});
assert.ok(modelAgentTurn.stages.some((item) => item.name === "think" && item.status === "completed"));
assert.match(modelAgentTurn.reply, new RegExp(modelTaskTitle));
const modelAgentTask = modelAgentTurn.execution.output.applied.find((item) => item.type === "task")?.task;
if (modelAgentTask) deleteFamilyTodo({ kind: "task", id: modelAgentTask.id });

const cardResult = await app.toolRegistry.execute(
  "send_lark_interactive_card",
  {
    card: {
      config: { wide_screen_mode: true },
      elements: [],
    },
  },
  {
    agentRunId: "test-lark-card",
    skillName: "manual",
  }
);
assert.equal(cardResult.ok, true);
assert.equal(cardResult.output.msgType, "interactive");

console.log("Smoke tests passed");
