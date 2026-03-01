# MiniClaw

The agentic core behind [usebonsai.org](https://usebonsai.org) and [miniclaw.bot](https://miniclaw.bot).

[blog.augmentedmike.com](https://blog.augmentedmike.com) — conceived, designed, coded, and authored by AugmentedMike, our AGI built on MiniClaw.

---

MiniClaw is a personal AI agent runtime built from the ground up with security-first design. It provides full system access — shell, filesystem, web, encrypted secrets, long-term memory, and a structured kanban workflow — all running behind a directory jail that enforces what the agent can and cannot do.

The architecture separates **body** (infrastructure, tools, memory, security) from **soul** (persona, skills, proactive behaviors). The soul is layered on top as a persona file.

## Features

- **Persona system** — switchable personas, each with isolated memory, conversations, knowledge base, kanban board, and config
- **Kanban board** — structured task management with state machine transitions, gate enforcement, and audit history
- **Knowledge base** — persistent KB with category tagging, confidence scoring, origin tracking, and expiration
- **Semantic search** — QMD integration for BM25, vector, and hybrid search across memory and tasks
- **Encrypted vault** — AES-256-GCM secrets storage for API keys, credentials, and notes
- **Directory jail** — multi-layer sandbox enforcement across shell, files, glob, and grep (64 adversarial tests)
- **Conversation continuity** — sliding-window history shared across CLI, Telegram, API, and dispatch channels
- **Autonomous dispatch** — cron-driven agent loop that picks the best ticket, enriches context via semantic search, works it autonomously, and logs structured audit trails
- **Service daemon** — launchd (macOS) and systemd (Linux) service management
- **Self-auditing devtools** — 11 static analysis tools for complexity, coupling, SOLID, duplication, dead code, and more

## Quick start

```bash
# Requires active Claude Max subscription with Claude CLI signed in
# (claude login)

git clone git@github.com:augmentedmike/miniclaw-bot.git
cd miniclaw-bot
npm install

# Build and install globally
npm run install:prod

# Run from any project directory (always jailed to cwd)
cd ~/projects/my-app
miniclaw --message "find all TODO comments"

# Or specify a directory explicitly
miniclaw ~/projects/my-app --message "find all TODO comments"

# Telegram bot mode (set token in .env)
echo "TELEGRAM_BOT_TOKEN=123:ABC" >> .env
npm start
```

## Modes

| Mode | Command | Description |
|------|---------|-------------|
| **One-shot** | `miniclaw --message "..."` | Single prompt, jailed to cwd |
| **One-shot (dir)** | `miniclaw /path --message "..."` | Single prompt, jailed to /path |
| **Telegram** | `npm start` | Long-running bot via polling |
| **HTTP serve** | `miniclaw serve` | HTTP API server |
| **Dispatch** | `miniclaw-dispatch run` | Autonomous agent cycle |

## CLI tools

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

## Agent tools

The agent has access to 22+ tools:

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

## Kanban workflow

Tasks follow a state machine with gate enforcement:

```
backlog → in-progress → in-review → shipped
```

**Gates** prevent premature transitions:
- **backlog → in-progress** requires filled Problem, Research, Implementation Plan, and Acceptance Criteria sections, plus an explicit project name
- **Forward moves** require all blockers resolved
- **in-review → shipped** for epics requires all child tasks shipped
- **Sendbacks** (backward moves) are always allowed

```bash
miniclaw-kanban add "Fix auth bug" --project myapp --type bugfix --priority high
miniclaw-kanban board
miniclaw-kanban check 1 in-progress
miniclaw-kanban move 1 in-progress
```

## Autonomous dispatch

A cron-driven system that autonomously works kanban tickets:

```bash
miniclaw-dispatch install              # Install 15-minute timer
miniclaw-dispatch run                  # Manual single cycle
miniclaw-dispatch status               # Show active agents + timer
miniclaw-dispatch logs                 # View audit trails
miniclaw-dispatch logs 42              # Logs for specific task
miniclaw-dispatch uninstall            # Remove timer
```

Each dispatch cycle:
1. Cleans stale locks
2. Checks concurrency cap (default: 1 concurrent agent)
3. Selects the best ready ticket (priority + due date + gate readiness)
4. Enriches context via QMD semantic search (related tickets + memory)
5. Runs the agent loop with full tool access + structured audit logging
6. Releases the lock when done

## Directory jail

When you pass a directory, all filesystem tools are restricted to that directory tree.

**File tools** resolve symlinks via `realpathSync` to catch symlink-escape attacks.

**Shell commands** are statically analyzed and blocked if they contain path traversal, encoding escapes, pipes to interpreters, or absolute paths outside the jail.

**Glob and grep** validate their search roots against the jail boundary.

64 adversarial tests verify the jail, including symlink escapes, path traversal, encoding attacks, and variable construction.

## Architecture

```
src/
  index.ts               Entry point (CLI, REPL, Telegram, serve)
  agent.ts               Vercel AI SDK agent loop + tool wiring
  auth.ts                Claude Max OAuth resolution
  config.ts              Layered config (defaults → system → persona → env)
  types.ts               Shared types
  kanban.ts              Kanban board engine (state machine, gates, CRUD)
  dispatch.ts            Autonomous dispatch (selection, locks, agent loop)
  service.ts             Service + dispatch daemon management
  system-prompt.ts       Minimal functional prompt
  conversation.ts        Conversation history (load/save/archive)
  context.ts             Pre-turn KB context retrieval
  persona.ts             Persona loading + prompt building
  vault.ts               AES-256-GCM encrypted vault

  tools/                 Agent tool definitions (Zod schemas + execute)
  telegram/              Grammy bot, handlers, formatting
  memory/                Markdown store + QMD search integration
  kb/                    SQLite knowledge base engine
  web/                   HTTP handler + kanban UI

  *-cli.ts               CLI entry points (vault, persona, snapshot, kanban, kb, service, dispatch)
```

## Testing

```bash
npm test                 # 461 tests across 36 files
npm run test:unit        # Unit tests only
npm run test:e2e         # End-to-end tests
npm run typecheck        # Type check (strict mode)
```

## Config

Layered resolution: hardcoded defaults → `~/.miniclaw/system/config.json` → persona config → environment variables.

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

## Devtools

11 static analysis tools that run on the codebase itself:

```bash
npm run audit            # Run all checks
npm run report           # Full report to reports/
npm run complexity       # Cyclomatic complexity per function
npm run solid            # SOLID principle violations
npm run coupling         # Module coupling metrics
npm run cohesion         # Module cohesion analysis
npm run duplication      # Duplicated code blocks
npm run dead-code        # Unused exports and orphan files
npm run readability      # Naming, line length, nesting depth
npm run depgraph         # Dependency graph
npm run api-surface      # Public API surface
npm run state-machine    # State machine pattern detection
npm run side-effects     # Side effect analysis
```

## Design philosophy

**Enforce, don't exploit.** Tools are built to define what an agent *should* do, with a jail that enforces the boundary.

**Body without a soul.** The system prompt is minimal and functional. Personality is a separate concern loaded as a persona file.

**Compound over time.** Memory, knowledge base, kanban workflow, and self-auditing tools mean the agent improves the more you use it.

## Contributing

We welcome contributions from both humans and AI agents. If the code is good, well explained, and it's a bugfix or a feature we want in core, we will accept it after review.

### Quality gates

Every commit runs through a pre-commit hook that enforces:

1. **Full test suite** — all 461+ tests must pass (`npm test`)
2. **Quality reports** — SOLID analysis, readability scoring, cohesion metrics, duplication detection, and more are generated and committed with every change

PRs that break tests or degrade quality metrics will not be merged.

### Code standards

Read [CODE_QUALITY.md](CODE_QUALITY.md) before contributing. The short version:

- Small, pure functions. Composition over inheritance. Data over objects.
- Types are documentation. Errors are values. No magic.
- No fallbacks, no swallowed errors, no silent degradation.
- Every function should be readable top to bottom.

### Running checks locally

```bash
npm test                 # Full test suite (unit + integration)
npm run typecheck        # TypeScript strict mode
npm run audit            # All quality checks (SOLID, complexity, coupling, readability, cohesion, duplication, dead code)
npm run report           # Generate full quality report to reports/
```

### AI agent PRs

We actively welcome PRs authored by AI agents. The same standards apply — clean code, clear commit messages, passing tests, and a description of what changed and why. If your agent can write code that passes our gates, we want to see it.

## License

Private. Powering [usebonsai.org](https://usebonsai.org) and [miniclaw.bot](https://miniclaw.bot).

[blog.augmentedmike.com](https://blog.augmentedmike.com) — written by AugmentedMike, our AGI built on MiniClaw.
