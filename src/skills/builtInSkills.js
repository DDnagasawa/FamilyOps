import { getConfig } from "../config/env.js";

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isTodoListRequest(text) {
  return /\b(show|send|list|open)\b.*\b(todo|to-do|task)\b/i.test(text) || /(显示|发送|查看|打开).*(待办|任务清单)|todo list/i.test(text);
}

export const skillHandlers = {
  dailyBriefing: async ({ input, tools, agentRunId, skillName }) => {
    const config = getConfig();
    const contextResult = await tools.execute("read_context", {}, { agentRunId, skillName });
    const context = contextResult.output;
    const realSourcesResult =
      input.includeRealSources === false
        ? null
        : await tools.execute("read_real_sources", {}, { agentRunId, skillName });
    const realSources = realSourcesResult?.output;
    const topN = Number(input.topN || config.agent.briefingTopN || 5);
    const items = context.briefingSources.slice(0, topN);
    const openTasks = (realSources?.openTasks || []).slice(0, topN);
    const recentSources = (realSources?.sources || []).slice(0, 4);

    const briefing = [
      `Daily Briefing - ${formatDate()}`,
      "",
      "Project Signals",
      realSources
        ? `Scanned ${realSources.sourceCount} real local sources. Open task count: ${realSources.openTasks.length}.`
        : "Real local source scan disabled for this run.",
      ...recentSources.map((source) => `- ${source.path}: ${source.summary}`),
      "",
      "Top Open Tasks",
      ...(openTasks.length
        ? openTasks.map((task, index) => `${index + 1}. ${task.title} (${task.source})`)
        : ["No open tasks found in configured real sources."]),
      "",
      "Context Briefing",
      ...items.map((item, index) => {
        return `${index + 1}. ${item.title}\n   Summary: ${item.summary}\n   Source: ${item.source}`;
      }),
      "",
      context.reminders.length
        ? `Reminder: ${context.reminders.map((reminder) => `${reminder.title} (${reminder.date})`).join("; ")}`
        : "Reminder: No reminders today.",
    ].join("\n");

    const shouldSend = input.sendLark ?? config.agent.defaultSendLark;
    let delivery = null;
    if (shouldSend) {
      delivery = await tools.execute("send_lark_message", { text: briefing }, { agentRunId, skillName });
    }

    return { briefing, delivery, realSources };
  },

  projectSummary: async ({ input, tools, agentRunId, skillName }) => {
    const config = getConfig();
    const contextResult = await tools.execute("read_context", {}, { agentRunId, skillName });
    const context = contextResult.output;

    const lines = context.projects.map((project) => {
      const tasks = project.tasks.map((task) => `- ${task.title}: ${task.status}`).join("\n");
      return [`Project: ${project.name}`, `Status: ${project.status}`, project.summary, tasks].join("\n");
    });

    const summary = [`Project Summary - ${formatDate()}`, "", ...lines].join("\n");

    const shouldSend = input.sendLark ?? config.agent.defaultSendLark;
    let delivery = null;
    if (shouldSend) {
      delivery = await tools.execute("send_lark_message", { text: summary }, { agentRunId, skillName });
    }

    return { summary, delivery };
  },

  socialPostDraft: async ({ input, tools, agentRunId, skillName }) => {
    const draft = input.text || "Today I built a Codex-powered local agent platform MVP.";
    const publishAttempt = await tools.execute("publish_social_post", { text: draft }, { agentRunId, skillName });
    return { draft, publishAttempt };
  },

  socialPostDraftOnly: async ({ input }) => {
    const topic = input.topic || "Codex-powered local agent platform";
    const tone = input.tone || "clear and practical";
    const draft = [
      `Draft social post (${tone})`,
      "",
      `Today I am building ${topic}.`,
      "The key idea is simple: Codex handles reasoning, while the local runtime controls tools, permissions, approvals, memory, logs, and connectors.",
      "High-risk actions stay approval-gated.",
    ].join("\n");
    return { draft, publishAttempt: null };
  },

  projectTaskUpdate: async ({ input, tools, agentRunId, skillName }) => {
    const result = await tools.execute(
      "update_project_task",
      {
        projectName: input.projectName || "General Agent Platform",
        taskTitle: input.taskTitle || "Add approval queue",
        status: input.status || "in_progress",
      },
      { agentRunId, skillName }
    );
    return { update: result };
  },

  projectManagementSync: async ({ input, tools, agentRunId, skillName }) => {
    const sync = await tools.execute(
      "sync_project_context",
      { destination: input.destination },
      { agentRunId, skillName }
    );
    const output = sync.output;
    const report = [
      `Project Management Sync - ${formatDate()}`,
      "",
      `Synced projects: ${output.projects.length}`,
      ...output.projects.map((project) => {
        const counts = Object.entries(project.taskCounts)
          .map(([status, count]) => `${status}: ${count}`)
          .join(", ");
        return `- ${project.name}: ${project.status} (${counts || "no tasks"})`;
      }),
    ].join("\n");

    let delivery = null;
    if (input.sendLark) {
      delivery = await tools.execute("send_lark_message", { text: report }, { agentRunId, skillName });
    }
    return { sync, report, delivery };
  },

  githubProjectSummary: async ({ input, tools, agentRunId, skillName }) => {
    const result = await tools.execute(
      "read_github_project_summary",
      { perPage: input.perPage || 10 },
      { agentRunId, skillName }
    );
    const summary = result.output;
    const report = [
      `GitHub Project Summary - ${formatDate()}`,
      "",
      `Repository: ${summary.repository.fullName}`,
      `URL: ${summary.repository.htmlUrl}`,
      `Description: ${summary.repository.description || "No description"}`,
      `Open issues count: ${summary.repository.openIssuesCount}`,
      ...(summary.warnings?.length
        ? ["", "Connector Warnings", ...summary.warnings.map((warning) => `- ${warning.name}: ${warning.message}`)]
        : []),
      "",
      "Open Issues",
      ...(summary.issues.length
        ? summary.issues.map((issue) => `- #${issue.number} ${issue.title} (${issue.updatedAt})`)
        : ["No open issues found."]),
      "",
      "Open Pull Requests",
      ...(summary.pullRequests.length
        ? summary.pullRequests.map((pr) => `- #${pr.number} ${pr.title} (${pr.updatedAt})`)
        : ["No open pull requests found."]),
      "",
      "Recent Commits",
      ...(summary.commits.length
        ? summary.commits.map((commit) => `- ${commit.sha} ${commit.message} (${commit.date})`)
        : ["No recent commits found."]),
    ].join("\n");

    let delivery = null;
    if (input.sendLark) {
      delivery = await tools.execute("send_lark_message", { text: report }, { agentRunId, skillName });
    }

    return { summary, report, delivery };
  },

  githubPublicProjectSummary: async ({ input, tools, agentRunId, skillName }) => {
    const result = await tools.execute(
      "read_github_public_project_summary",
      { owner: input.owner, repo: input.repo, perPage: input.perPage || 10 },
      { agentRunId, skillName }
    );
    const summary = result.output;
    const report = [
      `GitHub Public Repo Summary - ${formatDate()}`,
      "",
      `Repository: ${summary.repository.fullName}`,
      `URL: ${summary.repository.htmlUrl}`,
      `Description: ${summary.repository.description || "No description"}`,
      `Open issues count: ${summary.repository.openIssuesCount}`,
      ...(summary.warnings?.length
        ? ["", "Connector Warnings", ...summary.warnings.map((warning) => `- ${warning.name}: ${warning.message}`)]
        : []),
      "",
      "Open Issues",
      ...(summary.issues.length
        ? summary.issues.map((issue) => `- #${issue.number} ${issue.title} (${issue.updatedAt})`)
        : ["No open issues found."]),
      "",
      "Open Pull Requests",
      ...(summary.pullRequests.length
        ? summary.pullRequests.map((pr) => `- #${pr.number} ${pr.title} (${pr.updatedAt})`)
        : ["No open pull requests found."]),
      "",
      "Recent Commits",
      ...(summary.commits.length
        ? summary.commits.map((commit) => `- ${commit.sha} ${commit.message} (${commit.date})`)
        : ["No recent commits found."]),
    ].join("\n");

    let delivery = null;
    if (input.sendLark) {
      delivery = await tools.execute("send_lark_message", { text: report }, { agentRunId, skillName });
    }

    return { summary, report, delivery };
  },

  rssNewsBriefing: async ({ input, tools, agentRunId, skillName }) => {
    const config = getConfig();
    const result = await tools.execute(
      "read_rss_news",
      {
        feedUrls: input.feedUrls,
        limit: input.limit || 8,
      },
      { agentRunId, skillName }
    );
    const output = result.output;
    const report = [
      `RSS News Briefing - ${formatDate()}`,
      "",
      "Top Items",
      ...(output.items.length
        ? output.items.map((item, index) => {
            return [
              `${index + 1}. ${item.title}`,
              `   Source: ${item.source}`,
              item.publishedAt ? `   Published: ${item.publishedAt}` : null,
              item.url ? `   URL: ${item.url}` : null,
              item.summary ? `   Summary: ${item.summary.slice(0, 240)}` : null,
            ]
              .filter(Boolean)
              .join("\n");
          })
        : ["No RSS items found."]),
      ...(output.warnings.length
        ? ["", "Warnings", ...output.warnings.map((warning) => `- ${warning.feedUrl}: ${warning.message}`)]
        : []),
    ].join("\n");

    const shouldSend = input.sendLark ?? config.agent.defaultSendLark;
    let delivery = null;
    if (shouldSend) {
      delivery = await tools.execute("send_lark_message", { text: report }, { agentRunId, skillName });
    }

    return { items: output.items, warnings: output.warnings, report, delivery };
  },

  localFileOrganisation: async ({ input, tools, agentRunId, skillName }) => {
    const result = await tools.execute(
      "organize_local_files",
      {
        sourceDir: input.sourceDir || "data",
        targetDir: input.targetDir || "data/organized",
        dryRun: input.dryRun !== false,
      },
      { agentRunId, skillName }
    );
    return {
      result,
      summary: `File organisation ${result.output.dryRun ? "previewed" : "completed"} with ${result.output.moves.length} move(s).`,
    };
  },

  folderMonitoring: async ({ input, tools, agentRunId, skillName }) => {
    const result = await tools.execute(
      "scan_folder_changes",
      {
        paths: input.paths,
        maxFiles: input.maxFiles,
      },
      { agentRunId, skillName }
    );
    const output = result.output;
    const report = [
      `Folder Monitoring - ${formatDate()}`,
      "",
      `Watched paths: ${output.watchedPaths.join(", ")}`,
      `Change count: ${output.changeCount}`,
      ...output.changes.slice(0, 10).map((change) => `- ${change.type}: ${change.path}`),
    ].join("\n");
    return { result, report };
  },

  localScriptExecution: async ({ input, tools, agentRunId, skillName }) => {
    const result = await tools.execute(
      "run_local_script",
      {
        script: input.script,
        args: input.args || [],
        timeoutMs: input.timeoutMs,
      },
      { agentRunId, skillName }
    );
    return { execution: result };
  },

  socialMediaPublishing: async ({ input, tools, agentRunId, skillName }) => {
    const result = await tools.execute(
      "enqueue_social_post",
      {
        text: input.text,
        platform: input.platform || "generic",
        account: input.account || "default",
      },
      { agentRunId, skillName }
    );
    return { publishRequest: result };
  },

  familyReminder: async ({ input, tools, agentRunId, skillName }) => {
    const config = getConfig();
    const contextResult = await tools.execute("read_context", {}, { agentRunId, skillName });
    const context = contextResult.output;
    const familyResult = await tools.execute(
      "list_family_reminders",
      {
        date: input.date,
        daysAhead: input.daysAhead,
      },
      { agentRunId, skillName }
    );
    const familyReminderReport = familyResult.output.report;
    const reminders = context.reminders.map((reminder) => `${reminder.title} - ${reminder.date}`);
    const contextReminderReport = reminders.length ? ["Context Reminders", ...reminders.map((reminder) => `- ${reminder}`)] : ["Context Reminders", "- No context reminders found."];
    const message = [`Family Reminder - ${formatDate()}`, "", familyReminderReport, "", ...contextReminderReport].join("\n");

    const shouldSend = input.sendLark ?? config.agent.defaultSendLark;
    let delivery = null;
    if (shouldSend) {
      delivery = await tools.execute("send_lark_message", { text: message }, { agentRunId, skillName });
    }
    return { reminder: message, familyReminders: familyResult.output, delivery };
  },

  familyCoordinator: async ({ input, tools, agentRunId, skillName }) => {
    const config = getConfig();
    const text = String(input.text || "");
    if (isTodoListRequest(text)) {
      const todos = await tools.execute("send_family_todo_card", {}, { agentRunId, skillName });
      return {
        report: "Family Todo List card created.",
        todos,
        delivery: todos.output.delivery,
      };
    }

    const planning = await tools.execute(
      "plan_family_affairs",
      {
        text: input.text,
        actions: input.actions,
      },
      { agentRunId, skillName }
    );

    const report = planning.output.report;
    const shouldSend = input.sendLark ?? config.agent.defaultSendLark;
    let delivery = null;
    if (shouldSend) {
      delivery = await tools.execute("send_lark_message", { text: report }, { agentRunId, skillName });
    }

    return {
      report,
      planning,
      delivery,
    };
  },

  familyTodoList: async ({ tools, agentRunId, skillName }) => {
    const todos = await tools.execute("send_family_todo_card", {}, { agentRunId, skillName });
    return {
      report: "Family Todo List card created.",
      todos,
      delivery: todos.output.delivery,
    };
  },

  researchSummary: async ({ input, tools, agentRunId, skillName }) => {
    const topic = input.topic || "Codex-powered general local agent platform";
    const contextResult = await tools.execute("read_context", {}, { agentRunId, skillName });
    const context = contextResult.output;
    const relevant = context.briefingSources.map((item) => `- ${item.title}: ${item.summary}`).join("\n");
    return {
      topic,
      summary: [`Research Summary - ${formatDate()}`, `Topic: ${topic}`, "", relevant].join("\n"),
    };
  },

  webResearchReport: async ({ input, tools, agentRunId, skillName }) => {
    const config = getConfig();
    const topic = input.topic || input.query || "Codex-powered local agent platform";
    const limit = Number(input.limit || 3);
    const searchResult = await tools.execute(
      "search_web",
      { query: topic, limit },
      { agentRunId, skillName }
    );
    const searchItems = searchResult.output || [];
    const openedPages = [];

    for (const item of searchItems.slice(0, limit)) {
      try {
        const pageResult = await tools.execute(
          "open_web_page",
          { url: item.url },
          { agentRunId, skillName }
        );
        if (pageResult.ok) openedPages.push({ searchItem: item, page: pageResult.output });
      } catch (error) {
        openedPages.push({ searchItem: item, error: error.message });
      }
    }

    const report = [
      `Web Research Report - ${formatDate()}`,
      `Topic: ${topic}`,
      "",
      "Sources",
      ...(searchItems.length
        ? searchItems.map((item, index) => `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}`)
        : ["No search results found."]),
      "",
      "Extracted Notes",
      ...(openedPages.length
        ? openedPages.map((item, index) => {
            if (item.error) {
              return `${index + 1}. ${item.searchItem.title}\n   Failed to open: ${item.error}`;
            }
            const text = item.page.text.slice(0, 650);
            return `${index + 1}. ${item.page.title || item.searchItem.title}\n   URL: ${item.page.url}\n   Note: ${text}`;
          })
        : ["No pages opened."]),
      "",
      "Summary",
      openedPages.length
        ? `Reviewed ${openedPages.length} public pages for "${topic}". Use this as an evidence-gathering draft; verify important facts before external publication.`
        : "No web pages were reviewed.",
    ].join("\n");

    const shouldSend = input.sendLark ?? config.agent.defaultSendLark;
    let delivery = null;
    if (shouldSend) {
      delivery = await tools.execute("send_lark_message", { text: report }, { agentRunId, skillName });
    }

    return { topic, searchResults: searchItems, openedPages, report, delivery };
  },
};
