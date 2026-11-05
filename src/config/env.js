import fs from "node:fs";
import path from "node:path";

let loaded = false;

export function loadEnv(cwd = process.cwd()) {
  if (loaded) return process.env;

  const envPath = path.join(cwd, ".env");
  if (!fs.existsSync(envPath)) {
    loaded = true;
    return process.env;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  loaded = true;
  return process.env;
}

export function getConfig() {
  loadEnv();
  return {
    runMode: process.env.RUN_MODE || "codex_automation",
    lark: {
      webhookUrl: process.env.LARK_WEBHOOK_URL || "",
      secret: process.env.LARK_SECRET || "",
      appId: process.env.LARK_APP_ID || "",
      appSecret: process.env.LARK_APP_SECRET || "",
      apiBaseUrl: process.env.LARK_API_BASE_URL || "https://open.larksuite.com",
      receiveIdType: process.env.LARK_RECEIVE_ID_TYPE || "chat_id",
      receiveId: process.env.LARK_RECEIVE_ID || "",
      dryRun: String(process.env.LARK_DRY_RUN || "true") !== "false",
    },
    callback: {
      host: process.env.CALLBACK_HOST || "127.0.0.1",
      port: Number(process.env.CALLBACK_PORT || 8787),
      path: process.env.CALLBACK_PATH || "/lark/callback",
      publicUrl: process.env.CALLBACK_PUBLIC_URL || "",
      verificationToken: process.env.LARK_CALLBACK_VERIFICATION_TOKEN || "",
    },
    agent: {
      defaultSendLark: String(process.env.DEFAULT_SEND_LARK || "false") === "true",
      briefingTopN: Number(process.env.BRIEFING_TOP_N || 5),
      realSourcePaths: String(
        process.env.REAL_SOURCE_PATHS ||
          "PROJECT_MANAGEMENT_LOG.md,General_Agent_Implementation_Plan.md,README.md,data/run_history.json,data/audit.log"
      )
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      approvalRequiredFor: String(process.env.APPROVAL_REQUIRED_FOR || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    },
    model: {
      provider: process.env.AI_PROVIDER || "codex_in_the_loop",
      timeoutMs: Number(process.env.MODEL_ADAPTER_TIMEOUT_MS || 20000),
      retries: Number(process.env.MODEL_ADAPTER_RETRIES || 2),
      maxOutputTokens: Number(process.env.MODEL_ADAPTER_MAX_OUTPUT_TOKENS || 900),
      openaiKey: process.env.OPENAI_API_KEY || "",
      openaiModel: process.env.OPENAI_MODEL || "gpt-5-mini",
      openaiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      arkKey: process.env.ARK_API_KEY || "",
      arkModel: process.env.ARK_MODEL || "doubao-seed-2-0-lite-260215",
      arkBaseUrl: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      arkApiMode: process.env.ARK_API_MODE || "chat_completions",
      anthropicKey: process.env.ANTHROPIC_API_KEY || "",
      anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
      anthropicVersion: process.env.ANTHROPIC_VERSION || "2023-06-01",
      geminiKey: process.env.GEMINI_API_KEY || "",
      geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      geminiBaseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      ollamaModel: process.env.OLLAMA_MODEL || "llama3.1",
    },
    web: {
      searchProvider: process.env.WEB_SEARCH_PROVIDER || "duckduckgo_html",
      userAgent:
        process.env.WEB_USER_AGENT ||
        "Mozilla/5.0 (compatible; CodexGeneralLocalAgent/0.1; +https://openai.com)",
      maxPageChars: Number(process.env.WEB_MAX_PAGE_CHARS || 12000),
    },
    localExecution: {
      allowedRoot: process.env.LOCAL_EXECUTION_ROOT || process.cwd(),
      allowedScriptDir: process.env.LOCAL_SCRIPT_DIR || "scripts/agent",
      folderWatchPaths: String(process.env.FOLDER_WATCH_PATHS || "data,docs,skills")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    },
    github: {
      token: process.env.GITHUB_TOKEN || "",
      owner: process.env.GITHUB_OWNER || "",
      repo: process.env.GITHUB_REPO || "",
      apiBaseUrl: process.env.GITHUB_API_BASE_URL || "https://api.github.com",
    },
    news: {
      feedUrls: String(process.env.RSS_FEED_URLS || "https://github.blog/feed/")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    },
  };
}
