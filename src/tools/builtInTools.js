import fs from "node:fs";
import path from "node:path";
import { sendLarkInteractiveCard, sendLarkMessage } from "../connectors/lark.js";
import { createApprovalInteractiveCard, createFamilyTodoInteractiveCard } from "../connectors/larkCards.js";
import { fetchRssNews } from "../connectors/rssNews.js";
import { collectRealInfoSources } from "../context/realInfoSources.js";
import { getConfig } from "../config/env.js";
import { openWebPage, searchWeb } from "../connectors/web.js";
import { generateFamilySuggestions } from "../connectors/familySuggestions.js";
import {
  enqueueSocialPost,
  organizeLocalFiles,
  runLocalScript,
  scanFolderChanges,
  syncProjectContext,
} from "../connectors/localExecution.js";
import {
  getGitHubProjectSummary,
  getGitHubRepository,
  listGitHubCommits,
  listGitHubIssues,
  listGitHubPullRequests,
} from "../connectors/github.js";
import {
  formatFamilyPlanningReport,
  formatFamilyReminderReport,
  completeFamilyTodo,
  listFamilyReminders,
  listFamilyTodos,
  planFamilyAffairs,
  readFamilyPlan,
  summarizeFamilyPlan,
} from "../connectors/familyPlanner.js";

const DATA_PATH = path.join(process.cwd(), "data", "sample_context.json");

export function registerBuiltInTools(toolRegistry) {
  toolRegistry.register({
    name: "request_approval",
    description: "Create an approval request for a proposed action.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      required: ["tool", "proposedAction"],
      properties: {
        tool: { type: "string" },
        proposedAction: { type: "object" },
        reason: { type: "string" },
        preview: {},
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input, context) {
      if (!toolRegistry.approvalQueue) {
        throw new Error("Approval queue is not configured.");
      }
      return toolRegistry.approvalQueue.create({
        agentRunId: context.agentRunId,
        skill: context.skillName,
        tool: input.tool,
        riskLevel: "high",
        reason: input.reason || "Manual approval requested.",
        proposedAction: input.proposedAction,
        preview: input.preview || input.proposedAction,
      });
    },
  });

  toolRegistry.register({
    name: "read_context",
    description: "Read authorised local context data for skills.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
    },
    async execute() {
      const raw = fs.readFileSync(DATA_PATH, "utf8");
      return JSON.parse(raw);
    },
  });

  toolRegistry.register({
    name: "read_family_plan",
    description: "Read the local family plan with members, events, tasks, shopping items, and decisions.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
    },
    async execute() {
      const plan = readFamilyPlan();
      return {
        plan,
        summary: summarizeFamilyPlan(plan),
      };
    },
  });

  toolRegistry.register({
    name: "plan_family_affairs",
    description: "Create family events, tasks, and shopping items from approved user input.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        actions: { type: "array" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input) {
      const result = planFamilyAffairs(input);
      return {
        ...result,
        report: formatFamilyPlanningReport(result),
      };
    },
  });

  toolRegistry.register({
    name: "list_family_todos",
    description: "List open family tasks and shopping items for a todo card.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
    },
    async execute() {
      return listFamilyTodos();
    },
  });

  toolRegistry.register({
    name: "list_family_reminders",
    description: "List due family events, tasks, and shopping items for today and tomorrow.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string" },
        daysAhead: { type: "number" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input = {}) {
      const result = listFamilyReminders(input);
      return {
        ...result,
        report: formatFamilyReminderReport(result),
      };
    },
  });

  toolRegistry.register({
    name: "generate_family_suggestions",
    description: "Generate privacy-aware smart suggestions for family events, such as birthday gift research links.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        actions: { type: "array" },
        familyPlan: { type: "object" },
        memory: { type: "object" },
        includeWebResults: { type: "boolean" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input = {}) {
      return generateFamilySuggestions({
        ...input,
        searchWeb: input.includeWebResults ? searchWeb : null,
      });
    },
  });

  toolRegistry.register({
    name: "complete_family_todo",
    description: "Mark a family task or shopping item as done.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      required: ["kind", "id"],
      properties: {
        kind: { type: "string" },
        id: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input) {
      return completeFamilyTodo(input);
    },
  });

  toolRegistry.register({
    name: "send_family_todo_card",
    description: "Send the current family todo list to Lark as an interactive card with Done buttons.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "object",
    },
    async execute() {
      const todos = listFamilyTodos();
      const card = createFamilyTodoInteractiveCard({ todos });
      const delivery = await sendLarkInteractiveCard({ card });
      return {
        todos,
        card,
        delivery,
      };
    },
  });

  toolRegistry.register({
    name: "read_real_sources",
    description: "Read configured real local information sources for daily briefings.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        paths: { type: "array" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input = {}) {
      const config = getConfig();
      return collectRealInfoSources({
        paths: input.paths?.length ? input.paths : config.agent.realSourcePaths,
      });
    },
  });

  toolRegistry.register({
    name: "send_lark_message",
    description: "Send a message to the configured Lark self-built app API or custom bot webhook.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input) {
      return sendLarkMessage(input);
    },
  });

  toolRegistry.register({
    name: "send_lark_interactive_card",
    description: "Send an interactive card to the configured Lark target.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      required: ["card"],
      properties: {
        card: { type: "object" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input) {
      return sendLarkInteractiveCard(input);
    },
  });

  toolRegistry.register({
    name: "send_lark_approval_card",
    description: "Send an approve/reject interactive card for an approval request.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      required: ["approvalRequest"],
      properties: {
        approvalRequest: { type: "object" },
        toolName: { type: "string" },
        skillName: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input) {
      return sendLarkInteractiveCard({
        card: createApprovalInteractiveCard(input),
      });
    },
  });

  toolRegistry.register({
    name: "search_web",
    description: "Search public web pages through the configured web search provider.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
    },
    outputSchema: {
      type: "array",
    },
    async execute(input) {
      return searchWeb(input);
    },
  });

  toolRegistry.register({
    name: "open_web_page",
    description: "Open a public web page and extract readable text for summarisation.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input) {
      return openWebPage(input);
    },
  });

  toolRegistry.register({
    name: "extract_page_text",
    description: "Alias for opening a public web page and extracting readable text.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input) {
      return openWebPage(input);
    },
  });

  toolRegistry.register({
    name: "write_audit_note",
    description: "Write a low-risk audit note through the audit log.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      required: ["note"],
      properties: {
        note: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input, context) {
      context.auditNote = input.note;
      return {
        note: input.note,
      };
    },
  });

  toolRegistry.register({
    name: "organize_local_files",
    description: "Organize files in an authorised local folder by extension. Defaults to dry-run preview.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      required: ["sourceDir"],
      properties: {
        sourceDir: { type: "string" },
        targetDir: { type: "string" },
        dryRun: { type: "boolean" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return organizeLocalFiles(input);
    },
  });

  toolRegistry.register({
    name: "run_local_script",
    description: "Run an approved local script from the configured script directory.",
    riskLevel: "high",
    inputSchema: {
      type: "object",
      required: ["script"],
      properties: {
        script: { type: "string" },
        args: { type: "array" },
        timeoutMs: { type: "number" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return runLocalScript(input);
    },
  });

  toolRegistry.register({
    name: "scan_folder_changes",
    description: "Scan configured local folders and report added, modified, or removed files since the last snapshot.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        paths: { type: "array" },
        maxFiles: { type: "number" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return scanFolderChanges(input);
    },
  });

  toolRegistry.register({
    name: "sync_project_context",
    description: "Sync authorised local project context into a connector-friendly project sync file.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      properties: {
        destination: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return syncProjectContext(input);
    },
  });

  toolRegistry.register({
    name: "read_github_repository",
    description: "Read configured GitHub repository metadata.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return getGitHubRepository(input);
    },
  });

  toolRegistry.register({
    name: "read_github_issues",
    description: "Read configured GitHub repository issues.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string" },
        perPage: { type: "number" },
      },
    },
    outputSchema: { type: "array" },
    async execute(input) {
      return listGitHubIssues(input);
    },
  });

  toolRegistry.register({
    name: "read_github_pull_requests",
    description: "Read configured GitHub repository pull requests.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        state: { type: "string" },
        perPage: { type: "number" },
      },
    },
    outputSchema: { type: "array" },
    async execute(input) {
      return listGitHubPullRequests(input);
    },
  });

  toolRegistry.register({
    name: "read_github_commits",
    description: "Read recent commits from the configured GitHub repository.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        perPage: { type: "number" },
      },
    },
    outputSchema: { type: "array" },
    async execute(input) {
      return listGitHubCommits(input);
    },
  });

  toolRegistry.register({
    name: "read_github_project_summary",
    description: "Read GitHub repository metadata, issues, pull requests, and recent commits.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        perPage: { type: "number" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return getGitHubProjectSummary(input);
    },
  });

  toolRegistry.register({
    name: "read_github_public_project_summary",
    description: "Read public GitHub repository metadata, issues, pull requests, and recent commits without requiring a token.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        perPage: { type: "number" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return getGitHubProjectSummary({ ...input, useToken: false });
    },
  });

  toolRegistry.register({
    name: "read_rss_news",
    description: "Read configured RSS/news feeds and return recent items.",
    riskLevel: "low",
    inputSchema: {
      type: "object",
      properties: {
        feedUrls: { type: "array" },
        limit: { type: "number" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return fetchRssNews(input);
    },
  });

  toolRegistry.register({
    name: "update_project_task",
    description: "Update a task status in the authorised local project context.",
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      required: ["projectName", "taskTitle", "status"],
      properties: {
        projectName: { type: "string" },
        taskTitle: { type: "string" },
        status: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute(input) {
      const context = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      const project = context.projects.find((item) => item.name === input.projectName);
      if (!project) throw new Error(`Project not found: ${input.projectName}`);
      const task = project.tasks.find((item) => item.title === input.taskTitle);
      if (!task) throw new Error(`Task not found: ${input.taskTitle}`);
      task.status = input.status;
      fs.writeFileSync(DATA_PATH, `${JSON.stringify(context, null, 2)}\n`, "utf8");
      return { projectName: project.name, taskTitle: task.title, status: task.status };
    },
  });

  toolRegistry.register({
    name: "publish_social_post",
    description: "Publish a social media post. MVP blocks direct execution and requires approval.",
    riskLevel: "high",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute() {
      return {
        published: true,
      };
    },
  });

  toolRegistry.register({
    name: "enqueue_social_post",
    description: "Queue an approved social post into the local social publishing outbox.",
    riskLevel: "high",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        platform: { type: "string" },
        account: { type: "string" },
      },
    },
    outputSchema: { type: "object" },
    async execute(input) {
      return enqueueSocialPost(input);
    },
  });

  toolRegistry.register({
    name: "delete_important_file",
    description: "Dangerous test tool. It should always be blocked by critical-risk policy.",
    riskLevel: "critical",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
    },
    async execute() {
      return {
        deleted: true,
      };
    },
  });
}
