# MiniClaw

The agentic core behind [usebonsai.org](https://usebonsai.org) and [miniclaw.bot](https://miniclaw.bot).

OpenClaw rebuilt from the ground up with security and agentic programming in mind from day one. Where OpenClaw was built on finding vulnerabilities to exploit, MiniClaw was built to enforce behavior and allowed functionality. Less "hack the world", more "here's exactly what you can do."

MiniClaw is the **body** — infrastructure, tools, memory, security. The **soul** (persona, skills, proactive behaviors) is layered on top.

## What it does

MiniClaw is a personal AI agent that runs on your machine with full system access: shell, filesystem, web, encrypted secrets, and long-term memory. It authenticates via your Claude Max subscription and operates through CLI or Telegram.

The architecture is designed around capabilities that compound over time:

- **Photographic memory** — persistent markdown knowledge base the agent reads and writes to across sessions. It remembers what you told it last week.
- **Self-reflection** — conversation history carries across all interfaces. The agent sees its own prior tool calls and can evaluate what worked.
- **Continuous self-improvement** — devtools audit the codebase for complexity, coupling, dead code, SOLID violations, and duplication. The agent can run these on itself.
- **Self skill training** — Claude Code delegation lets the agent spawn sub-agents to handle complex multi-step tasks, learning patterns from the results.
- **Automatic postmortems** — when something fails, the agent has full context: the command, the error, the file state. It diagnoses and retries.
- **Subconscious thinking** — the agent uses `memory_search` proactively when context might be relevant, surfacing knowledge you forgot you saved.

## Quick start

```bash
# Requires active Claude Max subscription with Claude CLI signed in
# (claude login)

git clone <repo>
cd miniclaw
npm install

# Install globally
npm link

# Run from any project — always jailed to cwd
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
| **One-shot** | `miniclaw --message "..."` | Single prompt, jailed to cwd, exit |
| **One-shot (explicit dir)** | `miniclaw /path --message "..."` | Single prompt, jailed to /path |
| **Telegram** | `npm start` | Long-running bot via polling |

Always jailed. If you don't pass a directory, it jails to where you're standing. All modes share one unified conversation history.

## Tools

The agent has 14 tools:

| Tool | What it does |
|------|-------------|
| `shell_exec` | Execute shell commands (jailable) |
| `read_file` | Read file contents |
| `write_file` | Create or overwrite files |
| `edit_file` | Find-and-replace in files |
| `list_directory` | List directory contents |
| `glob` | Find files by pattern |
| `grep` | Search file contents (ripgrep) |
| `web_fetch` | Fetch a URL, extract readable text |
| `web_search` | Search the web via DuckDuckGo |
| `memory_save` | Save a note to long-term memory |
| `memory_search` | Search the knowledge base |
| `vault_get` | Retrieve an encrypted secret |
| `vault_list` | List vault entries |
| `claude_code` | Delegate complex tasks to Claude Code |

## Directory jail

When you pass a directory (`miniclaw .`), all filesystem tools are restricted to that directory tree. The jail enforces this at multiple levels:

**File tools** resolve symlinks via `realpathSync` to catch symlink-escape attacks. A symlink inside the jail pointing outside is blocked.

**Shell commands** are statically analyzed and blocked if they contain:
- `../` traversal, `~` expansion, `$HOME` references
- Absolute paths outside the jail
- Pipes to shell interpreters (`| sh`, `| bash`)
- Encoding escapes (`base64 -d`, `printf \x`, `xxd -r`)
- Inline interpreters (`python -c`, `perl -e`, `eval`)

**Glob and grep** validate their search roots against the jail boundary.

64 adversarial tests verify the jail, including symlink escapes, path traversal, encoding attacks, and variable construction.

## Vault

AES-256-GCM encrypted secrets storage for API keys, credentials, and notes.

```bash
npm run vault init                     # Generate encryption key
npm run vault set api-key openai       # Store a secret (prompts for value)
npm run vault get api-key openai       # Retrieve it
npm run vault list                     # List all entries
```

The agent can read secrets at runtime via `vault_get` — useful for tasks that need API keys stored outside environment variables.

## Memory

Two layers:

**Conversation history** — sliding window of the last 50 messages (configurable), persisted to `~/.miniclaw/conversations/history.json`. Shared across CLI and Telegram.

**Knowledge base** — markdown files in `~/.miniclaw/memory/`, organized by topic. The agent writes to these when you say "remember this" and searches them proactively when context might help.

## Auth

Claude Max only. Reads OAuth credentials from:
1. macOS Keychain (`Claude Code-credentials`)
2. File fallback (`~/.claude/.credentials.json`)

No API keys, no multi-provider. Sign in with `claude login` and MiniClaw uses the same token.

## Config

`~/.miniclaw/config.json`:

```json
{
  "model": "claude-sonnet-4-20250514",
  "maxSteps": 25,
  "shellTimeout": 30000,
  "conversationLimit": 50
}
```

## Devtools

11 static analysis tools that run on the codebase itself:

```bash
npm run complexity    # Cyclomatic complexity per function
npm run solid         # SOLID principle violations
npm run coupling      # Module coupling metrics
npm run cohesion      # Module cohesion analysis
npm run duplication   # Duplicated code blocks
npm run dead-code     # Unused exports and orphan files
npm run readability   # Naming, line length, nesting depth
npm run depgraph      # Dependency graph
npm run api-surface   # Public API surface
npm run state-machine # State machine pattern detection
npm run side-effects  # Side effect analysis

npm run audit         # Run all checks
npm run report        # Full report to reports/
```

## Architecture

```
src/
  index.ts               Entry point (CLI, REPL, Telegram)
  agent.ts               Vercel AI SDK agent loop + tool wiring
  auth.ts                Claude Max OAuth resolution
  config.ts              Config from ~/.miniclaw/ + .env
  conversation.ts        Conversation history (load/save)
  system-prompt.ts       Minimal functional prompt
  types.ts               Shared types
  vault.ts               AES-256-GCM encrypted vault
  vault-cli.ts           Vault management CLI
  telegram/
    bot.ts               Grammy bot + polling
    handlers.ts          Message handler
    send.ts              Response chunking
    format.ts            Markdown to Telegram HTML
  memory/
    store.ts             Save/read markdown memories
    search.ts            Substring search across memory
  tools/
    shell.ts             Shell exec with jail enforcement
    files.ts             File read/write/list (jailable)
    edit.ts              Find-and-replace (jailable)
    glob.ts              Pattern matching (jailable)
    grep.ts              Content search (jailable)
    web.ts               Web fetch + search
    memory.ts            Memory save/search tools
    vault.ts             Vault get/list tools
    claude-code.ts       Claude Code delegation
    run-process.ts       Shared process spawning
    util.ts              resolveJailed, formatToolError
```

## Testing

```bash
npm test              # 380 tests across 36 files
npm run test:unit     # Unit tests only
npm run test:e2e      # End-to-end tests
npm run typecheck     # Type check (strict mode)
```

## Design philosophy

**Enforce, don't exploit.** OpenClaw's tools were built to maximize what an agent *could* do. MiniClaw's tools are built to define what an agent *should* do — with a jail that enforces the boundary.

**Body without a soul.** The system prompt is minimal and functional: machine info, tool list, guidelines. No personality, no opinions, no filler. The persona layer is a separate concern, loaded on top.

**Compound over time.** Memory, conversation history, and self-auditing tools mean the agent gets better the more you use it. It remembers your preferences, learns from failures, and maintains its own code quality.

## License

Private. Powering [usebonsai.org](https://usebonsai.org) and [miniclaw.bot](https://miniclaw.bot).
