# FamilyOps

FamilyOps is an AI-assisted family coordination app with a local agent backend (Node.js, no npm dependencies).

The MVP includes:

- Agent runtime
- Skill registry
- Tool registry
- Permission manager
- Audit log
- Lark connector with self-built app API mode and dry-run mode
- Real local source-aware daily briefing
- Web search and browser automation MVP for public research reports
- Local execution MVP for file organisation, folder monitoring, project sync, script execution approval, and social publishing outbox
- GitHub connector for repository metadata, issues, pull requests, and commits
- GitHub public repository connector for token-free public repo reads
- RSS/news connector for external public feeds
- Lark interactive card approval framework
- Local callback server for Lark approve/reject actions
- Family coordinator skill for events, tasks, shopping items, privacy-aware reminders, and Lark updates
- Approval notifications with preview and approve/reject CLI commands
- Searchable local dashboard for approvals, run history, and audit logs
- Lark error notification path for failed scheduled tasks
- Built-in `daily_briefing`, `project_summary`, and `social_post_draft` skills

Codex remains the primary reasoning and execution channel by default. The default AI operation mode is **Codex-in-the-loop**: Codex uses its own account quota for reasoning and planning, while the local runtime provides controlled execution around tools, permissions, logs, and connectors. The App backend also includes an optional Model Adapter for direct OpenAI, Doubao/Volcengine Ark, Claude, Gemini, or Ollama understanding.

## Quick Start

```bash
npm test
npm run list:skills
npm run list:tools
npm run briefing
npm run project
```

By default, Lark sending is disabled unless a skill is called with `sendLark: true`. Even then, `.env.example` defaults `LARK_DRY_RUN=true`, so messages are returned as simulated output instead of being sent.

## Configure Environment

Copy `.env.example` to `.env` when real credentials are needed.

```bash
cp .env.example .env
```

For real Lark sending through the self-built app API:

```env
LARK_DRY_RUN=false
LARK_APP_ID=your_lark_app_id
LARK_APP_SECRET=your_lark_app_secret
LARK_RECEIVE_ID_TYPE=chat_id
LARK_RECEIVE_ID=your_target_chat_id
```

For MVP usage through Codex account quota, no separate model key is required:

```env
AI_PROVIDER=codex_in_the_loop
```

To let the App backend call a model directly for richer natural-language understanding, choose one provider:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5-mini
```

```env
AI_PROVIDER=doubao
ARK_API_KEY=your_volcengine_ark_api_key
ARK_MODEL=doubao-seed-2-0-lite-260215
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_MODE=chat_completions
MODEL_ADAPTER_MAX_OUTPUT_TOKENS=900
```

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-sonnet-5
```

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash
```

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

The model only returns structured household actions. The local agent core still controls permission checks, tool execution, storage, and audit logs.

For GitHub project summaries with a GitHub token:

```env
GITHUB_OWNER=your_github_owner
GITHUB_REPO=your_repository_name
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_TOKEN=your_github_pat
```

If `npm run github:summary` returns `404 Not Found`, the token is valid but cannot see the configured repository, or `GITHUB_OWNER` / `GITHUB_REPO` do not match the exact GitHub path.

For public GitHub repositories, the public connector can be run without relying on token access:

```bash
npm run github:public -- '{"owner":"openai","repo":"openai-node","perPage":3,"sendLark":false}'
```

For RSS/news sources:

```env
RSS_FEED_URLS=https://github.blog/feed/
```

Codex-in-the-loop task prompts:

```bash
npm run codex:prompts
npm run codex:prompt daily_briefing
npm run codex:prompt lark_family_inbox
```

Copy the generated prompt into a Codex Scheduled Task or Codex desktop task.

Real local sources used by the daily briefing are configured with:

```env
REAL_SOURCE_PATHS=README.md,data/run_history.json,data/audit.log
```

## Commands

List skills:

```bash
npm run list:skills
```

List tools:

```bash
npm run list:tools
```

Run daily briefing:

```bash
npm run briefing
```

Run a real-source daily briefing and send it to Lark:

```bash
npm run briefing:lark
```

Run project summary:

```bash
npm run project
```

Run local execution MVP skills:

```bash
npm run files:organize -- '{"sourceDir":"data","dryRun":true}'
npm run folders:scan -- '{"paths":["data"],"maxFiles":40}'
npm run project:sync -- '{"sendLark":false}'
npm run script:run -- '{"script":"example.sh"}'
npm run social:publish -- '{"text":"Approval gated post","platform":"x"}'
```

`script:run` and `social:publish` are high-risk by default, so they create approval requests instead of executing silently.

Run a skill with input:

```bash
node src/cli.js run daily_briefing '{"sendLark":true}'
```

Run family reminder:

```bash
npm run family
```

Arrange family affairs from approved text:

```bash
npm run family:plan -- '{"text":"Thomas dentist appointment on 2026-09-03; Anna prepare dinner task by 2026-09-02; John buy milk by 2026-09-01; surprise birthday for Lisa on 2026-09-10","sendLark":false}'
```

The family coordinator can also accept natural todo language:

```bash
npm run family:plan -- '{"text":"todo 今天我要去健身；今天晚上我要去聚会","sendLark":false}'
```

The family coordinator writes to the local family plan behind the scenes. Users do not need to know the file name. It can create events, tasks, and shopping items. It also skips duplicate shopping items, skips duplicate open tasks with the same date, and hides surprise reminders from the excluded person.

Send a clickable Todo card to Lark:

```bash
npm run family:todo
```

Each Todo card item has a `Done` button. When Lark callbacks are connected to the local callback server, tapping `Done` marks that task or shopping item as done and sends a refreshed Todo card.

Send the family update to Lark:

```bash
env LARK_DRY_RUN=false npm run family:plan -- '{"text":"Thomas football match on 2026-09-06","sendLark":true}'
```

Run research summary:

```bash
npm run research
```

Run public web research:

```bash
npm run web:research -- '{"topic":"AI agent browser automation","limit":3,"sendLark":false}'
```

Run public web research and send it to Lark:

```bash
npm run web:research:lark -- '{"topic":"AI agent browser automation","limit":3,"sendLark":true}'
```

Run RSS/news briefing:

```bash
npm run rss:news -- '{"limit":5,"sendLark":false}'
```

Validate and run the GitHub connector:

```bash
npm run validate:github
npm run github:summary -- '{"perPage":5,"sendLark":false}'
```

Run the local Lark callback server for interactive approval cards:

```bash
npm run callback:server
```

Local health check:

```bash
curl http://127.0.0.1:8787/health
```

For real Lark button callbacks, expose the local server through a public HTTPS tunnel and configure the Lark app callback URL to the tunnel URL plus `/lark/callback`.

The callback server also exposes a local family planning endpoint:

```bash
curl -X POST http://127.0.0.1:8787/family/plan \
  -H 'Content-Type: application/json' \
  -d '{"text":"Mrs Beecham call school by 2026-09-04; buy bread by 2026-09-01","sendLark":false}'
```

If Lark Event Subscriptions are connected later, text messages must start with `agent:`, `家庭:`, or `安排:` before the agent will arrange family affairs. This keeps ordinary group messages from being treated as tasks.

The Codex-in-the-loop bridge uses a local Lark inbox:

```bash
node src/cli.js lark:pending
node src/cli.js lark:processed <inboxMessageId> "handled by Codex"
```

The active Codex automation `Lark Family Inbox Processor` checks pending inbox messages and uses Codex reasoning to decide whether to create family tasks, events, shopping items, reminders, or Todo cards.

Test Lark connector in dry-run mode:

```bash
npm run test:lark
```

View audit logs:

```bash
node src/cli.js logs
```

List approvals:

```bash
node src/cli.js approvals
```

Approve or reject an approval request:

```bash
node src/cli.js approve <approvalId> "reason"
node src/cli.js reject <approvalId> "reason"
```

Approval notifications sent to Lark include the approval ID, risk level, action preview, and these approve/reject commands.

Run one scheduled cycle:

```bash
npm run daemon:once
```

View run history:

```bash
npm run history
```

Read or update local memory:

```bash
npm run memory
node src/cli.js memory:set preferences.briefingTone concise
```

Generate the local dashboard:

```bash
npm run dashboard
```

Generate a macOS launchd plist for 24/7 testing:

```bash
npm run launchd:plist
npm run launchd:callback-plist
```

## Safety Model

The MVP uses risk levels:

- `low`: automatic execution
- `medium`: automatic execution with audit logging
- `high`: approval required
- `critical`: blocked

The `social_post_draft` skill intentionally attempts a high-risk `publish_social_post` tool. The permission manager returns `approval_required`, proving that direct publishing is blocked in the current MVP.

When a high-risk action creates an approval request, the runtime now prefers sending a Lark interactive approval card with Approve and Reject buttons. If the callback server is publicly reachable by Lark, those buttons call back into the local approval queue.

## Current Limitations

- Approval queue is implemented. High-risk actions are persisted for approval.
- Lark sending is configured through the Lark self-built app API. Keep `LARK_DRY_RUN=true` during development.
- Daily briefing reads configured real local sources. GitHub project summaries and RSS/news are implemented. External sources such as calendar and Notion are still planned.
- Browser automation is currently an HTTP-based MVP for public search, page opening, and text extraction. Full interactive control such as clicking, form filling, screenshots, and logged-in sessions is still planned.
- Codex is represented as the default reasoning channel. Direct model calls are available only when the optional Model Adapter is configured in `.env`.
- Scheduler and daemon mode are implemented at MVP level. Production restart should use `launchd`, `pm2`, `systemd`, or Docker.
