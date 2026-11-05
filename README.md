# FamilyOps

FamilyOps is an AI-assisted family coordination app. A family member types one normal sentence, such as *"Lisa football match 2026-11-14"*, and FamilyOps turns it into a shared calendar event, task or shopping item, with reminders sent to the right people.

It was built for the **Home Secretary** case study (the Beecham family) in the 6CC550 Software Engineering module.

## Key idea: the model proposes, code decides

An AI model is optional. It can only return a structured proposal (event, task or shopping item). Normal code then checks the proposal, applies privacy rules and writes data through registered tools. Every write passes a permission check and is recorded in the audit log. If no model is configured, a rule-based planner does the same job.

```
observe → recall → resolve members → think → plan → privacy review → execute → suggest & remind
                                       ↑                                  ↓
                             optional AI model             ToolRegistry → PermissionManager → AuditLog
```

## Features

- **Accounts and family groups**: register, log in, and create or join a family with a 5-digit code
- **AI chat**: one sentence becomes an event, task or shopping item; repeated requests do not create duplicates
- **Shared calendar**: month and day views, weekly repeats and search
- **Todo and shopping list**: assign, complete and add reminders; a done item is done for everyone
- **Privacy-aware recipients**: surprise events exclude the target person, and you can edit recipients with × / +
- **Gift and venue suggestions**: search links only, so the app never buys anything
- **Memory and learning**: users can see and delete memories, and new rules apply only after approval
- **English / Chinese UI**: switch with one click in the top-right corner
- **Agent trace**: each reply shows the steps the agent took

## Requirements

- Node.js 18 or newer
- No npm dependencies

## Quick start

```bash
git clone https://github.com/DDnagasawa/FamilyOps.git
cd FamilyOps
cp .env.example .env
npm run app:server
```

Open http://127.0.0.1:5177/app, register an account, and create or join a family.

To use a different port, set `APP_PORT` in `.env`.

## Configuration

All settings are in `.env` (see `.env.example`).

| Setting | Purpose |
|---|---|
| `AI_PROVIDER` | `codex_in_the_loop` (default, rule-based planner), or `openai`, `doubao`, `anthropic`, `gemini`, `ollama` |
| `*_API_KEY`, `*_MODEL` | Credentials and model name for the chosen provider |
| `LARK_DRY_RUN` | `true` keeps Lark messages local (recommended for testing) |
| `APP_PORT` | App server port (default `5177`) |

Never commit `.env`. It is listed in `.gitignore`.

## Project structure

```
public/family-app/   Web app (HTML, CSS, JS, i18n)
src/server/          App server and API routes
src/agent/           FamilyAgentCore (agent pipeline)
src/model/           Model adapter for optional LLM providers
src/auth/            User store, sessions, family groups
src/connectors/      Planner, member resolver, suggestions, Lark, RSS, GitHub
src/memory/          Memory and learning layer
src/tools/           Tool registry and built-in tools
src/permissions/     Permission manager and risk levels
src/approvals/       Approval queue
skills/              Skill definitions and test cases
tests/               Node test runner tests
```

Runtime data (users, family plan, audit log) is written to `data/` and is not tracked by Git.

## Tests

```bash
npm test
```

## Command-line tools

The original agent CLI is still available, for example:

```bash
npm run list:skills
npm run briefing
npm run family:plan
```

## Known limitations

- Family plan routes are not yet scoped by login, and all families share one plan file.
- A surprise event is hidden from its target's reminders, but it is still visible in the target's own calendar.
- Without an AI model, dates must be given as `YYYY-MM-DD`. Phrases like "next week" need a model.
- Two tests depend on the current date and live data, and need to be isolated.
- Data is stored in local JSON files, not a database.
