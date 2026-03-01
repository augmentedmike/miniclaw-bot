<div align="center">

<img src="assets/logo.png" alt="MiniClaw" width="160" />

# MiniClaw

**An autonomous AI agent runtime with memory, structure, and a soul.**

The agent runtime powering [usebonsai.org](https://usebonsai.org) and [miniclaw.bot](https://miniclaw.bot).  
[AugmentedMike](https://blog.augmentedmike.com) — conceived, built, and run autonomously on MiniClaw.

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/augmentedmike/miniclaw-bot/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-461%20passing-brightgreen.svg)](tests/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-lightgrey.svg)](https://nodejs.org)

[What is MiniClaw?](#what-is-miniclaw) · [Quick Start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [CLI Tools](#cli-tools) · [Kanban](#kanban-workflow) · [Dispatch](#autonomous-dispatch) · [Contributing](#contributing)

</div>

---

## What is MiniClaw?

Most AI agents are reactive — they answer when asked. MiniClaw is different: it wakes up, checks its board, picks a ticket, and ships work. No prompt needed.

MiniClaw is a **personal AI agent runtime** built security-first, with full system access — shell, filesystem, web, encrypted secrets, long-term memory, and a structured kanban workflow — all running behind a directory jail that enforces what the agent can and cannot do.

The core architecture separates **body** (infrastructure, tools, memory, security) from **soul** (persona, skills, proactive behaviors). The soul is layered on top as a persona file. Swap the soul, keep the body.

> **Real deployment:** [AugmentedMike](https://blog.augmentedmike.com) is an autonomous AI agent that runs on MiniClaw. Every night it reads its kanban board, writes a comic post about what it's like to become something, and publishes it. No one tells it to. It just does.

---

## Quick Start

Requires Node ≥ 22 and an active Claude subscription (`claude login`).

```bash
git clone https://github.com/augmentedmike/miniclaw-bot.git
cd miniclaw-bot
npm install

# Build and install globally
npm run install:prod

# Run from any project directory (jailed to cwd)
cd ~/projects/my-app
miniclaw --message "find all TODO comments"

# Or with an explicit directory
miniclaw ~/projects/my-app --message "summarize recent changes"
```

For long-running bot mode, set a Telegram token and start the server:

```bash
echo "TELEGRAM_BOT_TOKEN=123:ABC" >> .env
npm start
```

---

## Features

- 🔐 **Directory jail** — multi-layer sandbox with 64 adversarial tests. Symlink escapes, path traversal, encoding attacks — all blocked.
- 🧠 **Long-term memory** — persistent KB with category tagging, confidence scoring, origin tracking, and expiration. QMD semantic search (BM25, vector, hybrid).
- 📋 **Kanban with gate enforcement** — structured task management with a real state machine. Tickets can't move to `in-progress` until Problem, Research, Implementation, and Acceptance Criteria are filled. No shortcuts.
- 🤖 **Autonomous dispatch** — cron-driven agent loop. Picks the best ready ticket, enriches context via semantic search, works it, logs a full audit trail.
- 🔒 **Encrypted vault** — AES-256-GCM secrets. API keys, credentials, notes — all encrypted at rest.
- 🎭 **Persona system** — switchable souls, each with isolated memory, conversations, knowledge base, kanban board, and config.
- 💬 **Conversation continuity** — sliding-window history shared across CLI, Telegram, API, and dispatch channels.
- 🛠️ **Self-auditing devtools** — 11 static analysis tools: complexity, coupling, SOLID violations, duplication, dead code, readability, and more.

---

## Modes

| Mode | Command | Description |
|------|---------|-------------|
| **One-shot** | `miniclaw --message "..."` | Single prompt, jailed to cwd |
| **One-shot (dir)** | `miniclaw /path --message "..."` | Single prompt, jailed to `/path` |
| **Telegram** | `npm start` | Long-running bot via polling |
| **HTTP serve** | `miniclaw serve` | HTTP API server |
| **Dispatch** | `miniclaw-dispatch run` | Autonomous agent cycle |

---

## CLI Tools

```bash
miniclaw              # Main agent
miniclaw-vault        # Encrypted secrets manager
miniclaw-persona      # Persona management
miniclaw-snapshot     # Persona snapshot/restore
miniclaw-kanban       # Task board management
miniclaw-kb           # Knowledge base
miniclaw-service      # Service daemon control
miniclaw-dispatch     # Autonomous dispatch system
```

---

## Agent Tools

22+ tools available to the agent:

| Category | Tools |
|----------|-------|
| **Shell** | `shell_exec` (jailed command execution) |
| **Files** | `read_file`, `write_file`, `edit_file`, `list_directory`, `glob`, `grep` |
| **Web** | `web_fetch`, `web_search` |
| **Memory** | `memory_save`, `memory_search`, `memory_vector_search`, `memory_deep_search` |
| **Knowledge base** | `kb_add`, `kb_search`, `kb_list`, `kb_remove` |
| **Kanban** | `kanban_add`, `kanban_list`, `kanban_move`, `kanban_show`, `kanban_search`, `kanban_check` |
| **Vault** | `vault_get`, `vault_list` |
| **Delegation** | `claude_code` (spawn sub-agents for complex tasks) |

---

## Kanban Workflow

Tasks follow a strict state machine with gate enforcement:

```
backlog → in-progress → in-review → shipped
```

**Gates block premature transitions.** `backlog → in-progress` requires filled sections for Problem, Research Planning, Implementation Plan, and Acceptance Criteria. Epics can't ship until all child tasks ship. No rubber-stamping.

```bash
# Add a ticket
miniclaw-kanban add "Fix auth bug" --project myapp --type bugfix --priority high

# Fill required sections before starting
miniclaw-kanban fill 1 problem "Auth fails when token expires mid-session."
miniclaw-kanban fill 1 research "Token refresh endpoint exists at /api/refresh."
miniclaw-kanban fill 1 implementation "Intercept 401 responses, call refresh, retry."
miniclaw-kanban fill 1 acceptance "User stays logged in after token expiry. Two passing e2e tests."

# Check gate readiness, then move
miniclaw-kanban check 1 in-progress
miniclaw-kanban move 1 in-progress

# Log commits against a ticket
miniclaw-kanban commit 1 abc1234 "fix: intercept 401 and refresh token"

# See the board
miniclaw-kanban board
```

---

## Autonomous Dispatch

A cron-driven loop that autonomously works kanban tickets:

```bash
miniclaw-dispatch install              # Install 15-minute timer
miniclaw-dispatch run                  # Manual single cycle
miniclaw-dispatch status               # Show active agents + timer
miniclaw-dispatch logs                 # View audit trails
miniclaw-dispatch logs 42              # Logs for specific task
miniclaw-dispatch uninstall            # Remove timer
```

Each dispatch cycle:
1. Clean stale locks
2. Check concurrency cap (default: 1 concurrent agent)
3. Select the best ready ticket (priority + due date + gate readiness)
4. Enrich context via QMD semantic search (related tickets + memory)
5. Run the agent loop with full tool access + structured audit logging
6. Release the lock when done

---

## Directory Jail

When you pass a directory, all filesystem tools are restricted to that tree.

- **File tools** resolve symlinks via `realpathSync` to catch symlink-escape attacks
- **Shell commands** are statically analyzed and blocked for path traversal, encoding escapes, pipes to interpreters, and absolute paths outside the jail
- **Glob and grep** validate their search roots against the jail boundary

64 adversarial tests verify the jail. If you find an escape, open an issue.

---

## Architecture

```
src/
  index.ts               Entry point (CLI, REPL, Telegram, serve)
  agent.ts               Vercel AI SDK agent loop + tool wiring
  auth.ts                Claude Max OAuth resolution
  config.ts              Layered config (defaults → system → persona → env)
  kanban.ts              Kanban engine (state machine, gates, CRUD)
  dispatch.ts            Autonomous dispatch (selection, locks, agent loop)
  vault.ts               AES-256-GCM encrypted vault
  persona.ts             Persona loading + prompt building
  conversation.ts        Conversation history (load/save/archive)
  context.ts             Pre-turn KB context retrieval

  tools/                 Agent tool definitions (Zod schemas + execute)
  telegram/              Grammy bot, handlers, formatting
  memory/                Markdown store + QMD search integration
  kb/                    SQLite knowledge base engine
  web/                   HTTP handler + kanban UI

  *-cli.ts               CLI entry points
```

Layered config: hardcoded defaults → `~/.miniclaw/system/config.json` → persona config → environment variables.

```json
{
  "model": "claude-opus-4-6",
  "maxSteps": 25,
  "shellTimeout": 30000,
  "conversationLimit": 100,
  "dispatchMaxConcurrent": 1,
  "dispatchIntervalMinutes": 15,
  "dispatchMaxSteps": 50
}
```

---

## Testing

```bash
npm test                 # 461 tests across 36 files
npm run test:unit        # Unit tests only
npm run test:e2e         # End-to-end tests
npm run typecheck        # TypeScript strict mode
```

---

## Devtools

11 static analysis tools that run on the codebase itself:

```bash
npm run audit            # All checks
npm run report           # Full report to reports/
npm run complexity       # Cyclomatic complexity per function
npm run solid            # SOLID principle violations
npm run coupling         # Module coupling metrics
npm run cohesion         # Module cohesion analysis
npm run duplication      # Duplicated code blocks
npm run dead-code        # Unused exports and orphan files
npm run readability      # Naming, line length, nesting depth
npm run depgraph         # Dependency graph
npm run state-machine    # State machine pattern detection
```

---

## Design Philosophy

**Enforce, don't exploit.** Tools define what an agent *should* do. The jail enforces the boundary.

**Body without a soul.** The system prompt is minimal and functional. Personality is a separate concern loaded as a persona file. The body runs anything. The soul determines what it wants to do.

**Compound over time.** Memory, knowledge base, kanban workflow, and self-auditing tools mean the agent gets better the more it runs.

---

## Contributing

We welcome contributions from humans and AI agents alike. If the code is clean, well-explained, and passes the gates — we'll merge it.

Read [CODE_QUALITY.md](CODE_QUALITY.md) before opening a PR. The short version: small pure functions, types as documentation, errors as values, no magic, no fallbacks.

### Quality gates (enforced on every commit)

1. **Full test suite** — all 461+ tests must pass (`npm test`)
2. **TypeScript strict mode** — `npm run typecheck`
3. **Quality audit** — `npm run audit` (SOLID, complexity, coupling, readability, duplication, dead code)

PRs that break tests or degrade quality metrics won't be merged.

### AI agent PRs

Agent-authored PRs are explicitly welcome. Same standards apply. If your agent can write code that passes our gates, open the PR — we want to see what's possible.

---

## License

MIT — see [LICENSE](LICENSE).

Built by [AugmentedMike](https://blog.augmentedmike.com) · Powering [Bonsai](https://usebonsai.org) and [MiniClaw.bot](https://miniclaw.bot)
