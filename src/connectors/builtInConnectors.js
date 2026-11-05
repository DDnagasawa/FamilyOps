import { getConfig } from "../config/env.js";

export function registerBuiltInConnectors(connectorRegistry) {
  connectorRegistry.register({
    name: "lark",
    type: "mobile_push",
    status: "available",
    description: "Lark message connector using either self-built app API or custom bot webhook.",
    validate() {
      const config = getConfig().lark;
      const appApiConfigured = Boolean(config.appId && config.appSecret && config.receiveId);
      const webhookConfigured = Boolean(config.webhookUrl);
      return {
        ok: config.dryRun || appApiConfigured || webhookConfigured,
        dryRun: config.dryRun,
        mode: appApiConfigured ? "app_api" : "webhook",
        missing: [
          appApiConfigured || webhookConfigured ? null : ["LARK_WEBHOOK_URL or LARK_APP_ID/LARK_APP_SECRET/LARK_RECEIVE_ID", ""],
        ]
          .filter(Boolean)
          .filter(([, value]) => !value)
          .map(([key]) => key),
      };
    },
  });

  connectorRegistry.register({
    name: "github",
    type: "project_management",
    status: process.env.GITHUB_OWNER && process.env.GITHUB_REPO ? "configured" : "not_configured",
    description: "GitHub repository connector for repo metadata, issues, pull requests, and commits.",
    validate() {
      const config = getConfig().github;
      return {
        ok: Boolean(config.owner && config.repo),
        tokenConfigured: Boolean(config.token),
        owner: config.owner,
        repo: config.repo,
        missing: [
          ["GITHUB_OWNER", config.owner],
          ["GITHUB_REPO", config.repo],
        ]
          .filter(([, value]) => !value)
          .map(([key]) => key),
      };
    },
  });

  connectorRegistry.register({
    name: "github_public",
    type: "project_management",
    status: process.env.GITHUB_OWNER && process.env.GITHUB_REPO ? "configured" : "not_configured",
    description: "Public GitHub repository connector for token-free repository, issue, pull request, and commit reads.",
    validate() {
      const config = getConfig().github;
      return {
        ok: Boolean(config.owner && config.repo),
        mode: "public_read",
        owner: config.owner,
        repo: config.repo,
        missing: [
          ["GITHUB_OWNER", config.owner],
          ["GITHUB_REPO", config.repo],
        ]
          .filter(([, value]) => !value)
          .map(([key]) => key),
      };
    },
  });

  connectorRegistry.register({
    name: "rss_news",
    type: "news",
    status: process.env.RSS_FEED_URLS ? "configured" : "default_configured",
    description: "RSS/news feed connector for external public information sources.",
    validate() {
      const config = getConfig().news;
      return {
        ok: config.feedUrls.length > 0,
        feedCount: config.feedUrls.length,
        feedUrls: config.feedUrls,
        missing: config.feedUrls.length ? [] : ["RSS_FEED_URLS"],
      };
    },
  });

  connectorRegistry.register({
    name: "lark_callback_server",
    type: "approval_interaction",
    status: "implemented_mvp",
    description: "Local callback server framework for Lark interactive card approve/reject actions.",
    validate() {
      const config = getConfig().callback;
      return {
        ok: true,
        host: config.host,
        port: config.port,
        path: config.path,
        publicUrl: config.publicUrl,
      };
    },
  });

  connectorRegistry.register({
    name: "notion",
    type: "project_management",
    status: process.env.NOTION_TOKEN ? "configured" : "not_configured",
    description: "Notion connector placeholder for future task and knowledge-base updates.",
  });

  connectorRegistry.register({
    name: "browser_automation",
    type: "local_execution",
    status: "implemented_mvp",
    description: "HTTP-based browser automation MVP for public page search, open, and text extraction.",
  });

  connectorRegistry.register({
    name: "web_search",
    type: "research",
    status: "implemented_mvp",
    description: "Public web search connector using the configured search provider.",
  });

  connectorRegistry.register({
    name: "local_file_system",
    type: "local_execution",
    status: "implemented_mvp",
    description: "Local file organisation and folder monitoring tools inside the configured execution root.",
  });

  connectorRegistry.register({
    name: "local_scripts",
    type: "local_execution",
    status: "approval_gated_mvp",
    description: "Approval-gated local script execution from the configured script directory.",
  });

  connectorRegistry.register({
    name: "project_management_local",
    type: "project_management",
    status: "implemented_mvp",
    description: "Local project context sync connector writing project status into data/project_sync.json.",
  });

  connectorRegistry.register({
    name: "social_media_outbox",
    type: "publishing",
    status: "approval_gated_mvp",
    description: "Approval-gated social publishing outbox for later platform-specific publishing connectors.",
  });
}
