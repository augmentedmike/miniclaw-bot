# Miniclaw: Minimal AI Agent with Telegram + System Access

## Context

Extract 4 core systems from [openclaw/openclaw](https://github.com/openclaw/openclaw) (cloned to `/tmp/openclaw-research`) and rebuild them into a standalone personal AI agent at `/Users/michaeloneal/development/v2-clean/miniclaw`. The agent connects to Telegram, authenticates with LLM providers, runs an agentic tool loop, and has root-level system access. We explicitly exclude skills, soul/personality, the plugin system, all 39 non-Telegram channels, web UI, and mobile apps.

## Key Design Decisions

### Replace pi-ai with Vercel AI SDK
OpenClaw's LLM runtime (`@mariozechner/pi-ai`, `pi-agent-core`, `pi-coding-agent`) is deeply coupled to the full system (900+ line `attempt.ts` with 80+ imports). Instead, we use the **Vercel AI SDK** (`ai` package) which provides:
- `generateText`/`streamText` with built-in tool loop (`maxSteps`)
- Provider package: `@ai-sdk/anthropic` (Claude Max only)
- Clean tool definitions with Zod schemas
- Minimal runtime deps vs OpenClaw's 50+

### Claude Max Only — No API Keys
Authentication is exclusively via Claude Max subscription OAuth credentials. No direct API keys, no multi-provider fallback, no OpenAI/Google. The agent reads Claude CLI OAuth tokens from:
1. macOS Keychain (`security find-generic-password -s "Claude Code-credentials" -w`)
2. File fallback: `~/.claude/.credentials.json`
If the token is expired, refresh via Anthropic's OAuth endpoint and write back. The `accessToken` is passed to `@ai-sdk/anthropic` as the API key.

### Use qmd for filesystem-based memory
Instead of building custom memory from scratch, use [qmd](https://github.com/tobi/qmd) — an on-device search engine for markdown notes. It provides BM25 full-text search, vector semantic search, and LLM re-ranking, all running locally. The agent writes markdown files to `~/.miniclaw/memory/` and qmd indexes + searches them. qmd also exposes an MCP server with tools (`qmd_search`, `qmd_vector_search`, `qmd_deep_search`, `qmd_get`) that can be wired directly into the agent's tool loop.

### Minimal config: .env + JSON
Replace OpenClaw's 180-file config system with `.env` for secrets + `~/.miniclaw/config.json` for settings.

### No approval system for shell execution
User is running this as a personal agent with root access. No command approval gates.

---

## Phase 1: Project Scaffolding + Model Auth + Agent Loop

**Goal**: CLI agent that takes a message, calls an LLM with tools, prints the response.

### Files to create:
```
package.json
tsconfig.json
.env.example
.gitignore
src/
  index.ts              -- Entry point: parse args, run agent or start telegram
  config.ts             -- Load .env + ~/.miniclaw/config.json
  auth.ts               -- Resolve provider API keys from env vars
  agent.ts              -- Vercel AI SDK streamText loop with tools
  system-prompt.ts      -- Minimal system prompt: machine info + date + tool list (NO personality/soul)
  types.ts              -- Shared types
  tools/
    shell.ts            -- shell_exec: spawn child process, return stdout/stderr/exitCode
    files.ts            -- read_file, write_file, list_directory tools
```

### What to extract from OpenClaw:
- **`auth.ts`**: Claude Max subscription auth only, extracted from `src/agents/cli-credentials.ts`. Read Claude CLI OAuth credentials from:
  1. macOS Keychain (`security find-generic-password -s "Claude Code-credentials" -w`) — parsed as `{ claudeAiOauth: { accessToken, refreshToken, expiresAt } }`
  2. File fallback: `~/.claude/.credentials.json` — same format
  The `accessToken` is used as the API key for `@ai-sdk/anthropic`. If expired, refresh using the refresh token against Anthropic's OAuth endpoint, then write back to keychain/file (same pattern as OpenClaw's `writeClaudeCliCredentials`).
  No env var API key fallback. No multi-provider. Claude Max only.
- **`tools/shell.ts`**: Concept from `src/agents/bash-tools.ts` but written fresh. Simple `child_process.spawn` with configurable timeout (default 30s).
- **`system-prompt.ts`**: Inspired by `src/agents/system-prompt.ts` pattern but minimal — hardcoded functional prompt with machine info, date, and available tool descriptions. No personality file loading — the agent is a body without a soul.

### Key OpenClaw reference files for auth:
- `src/agents/cli-credentials.ts` — `readClaudeCliCredentials()`, `readClaudeCliKeychainCredentials()`, `writeClaudeCliCredentials()` (keychain read/write, file read/write, credential parsing)
- `src/agents/auth-profiles/oauth.ts` — `refreshOAuthTokenWithLock()` (OAuth token refresh flow via `@mariozechner/pi-ai`'s `getOAuthApiKey`)
- `src/agents/model-auth.ts` — `resolveEnvApiKey()` (env var resolution for anthropic: `ANTHROPIC_OAUTH_TOKEN` → `ANTHROPIC_API_KEY`)
- `src/commands/auth-token.ts` — setup-token validation (`sk-ant-oat01-*` prefix, min 80 chars)

### Dependencies:
```json
{
  "ai": "^4.0",
  "@ai-sdk/anthropic": "^1.0",
  "dotenv": "^17.0",
  "zod": "^3.23"
}
```

### Verify:
```bash
# Requires active Claude Max subscription with Claude CLI signed in
npx tsx src/index.ts --message "list files in /tmp"
# Should read OAuth token from keychain, call shell_exec, show output, print response
```

---

## Phase 2: Telegram Gateway

**Goal**: Receive messages via Telegram bot, pass to agent, send chunked responses back.

### Files to create:
```
src/
  telegram/
    bot.ts              -- Create Grammy bot, register handlers, start polling
    handlers.ts         -- on("message:text") → run agent → send response
    send.ts             -- Chunk text at 4096 chars, send with parse_mode
    format.ts           -- Markdown → Telegram HTML conversion
```

### What to extract from OpenClaw:
- **`telegram/bot.ts`**: Simplified from `src/telegram/bot.ts` + `src/telegram/monitor.ts`. Core pattern: `new Bot(token)` → `apiThrottler()` → `registerHandlers()` → `run(bot)` from `@grammyjs/runner`. Remove: multi-account, sequentialization, proxy, native commands, group policies, offset persistence.
- **`telegram/handlers.ts`**: Simplified from `src/telegram/bot-handlers.ts` (900 lines → ~50 lines). Just `bot.on("message:text")`, extract text, call `runAgent()`, send response.
- **`telegram/send.ts`**: Adapted from `src/telegram/send.ts`. Keep: text chunking at 4096 chars, `sendMessage` with HTML parse mode, basic retry. Remove: media sending, polls, voice, inline buttons, target resolution.
- **`telegram/format.ts`**: Adapted from `src/telegram/format.ts`. Keep: `renderTelegramHtmlText` for code blocks, bold, italic, links. Simplify to handle common markdown patterns.

### Additional dependencies:
```json
{
  "grammy": "^1.40",
  "@grammyjs/runner": "^2.0",
  "@grammyjs/transformer-throttler": "^1.2"
}
```

### Update `src/index.ts`:
- Default mode: start Telegram bot (polling)
- `--message "..."` flag: one-shot CLI mode (from Phase 1)

### Verify:
```bash
echo "TELEGRAM_BOT_TOKEN=123:ABC" >> .env
npx tsx src/index.ts
# Send message to bot in Telegram → get LLM response back
```

---

## Phase 3: Conversation History + Memory (qmd)

**Goal**: Agent remembers conversation context across all interfaces, can save/search notes via qmd.

This is a personal agent for 1-2 humans, not a multi-tenant app. All interfaces (Telegram, CLI) share one unified conversation history so the agent always remembers what was said regardless of which interface was used.

### Files to create:
```
src/
  conversation.ts       -- Load/save unified message history as JSON
  memory/
    store.ts            -- Write markdown files to ~/.miniclaw/memory/
    qmd.ts              -- Shell out to `qmd` CLI for search/indexing
  tools/
    memory.ts           -- memory_save (write md + re-index), memory_search (qmd query)
```

### Approach:
- **`conversation.ts`**: Fresh. Single unified history in `~/.miniclaw/conversations/history.json` (not per-chat-id). Sliding window: keep last N messages (configurable, default 50).
- **`memory/store.ts`**: Write markdown files to `~/.miniclaw/memory/{topic}.md`. Append or overwrite per topic.
- **`memory/qmd.ts`**: Shell wrapper around `qmd` CLI. On startup, ensure `~/.miniclaw/memory/` is registered as a qmd collection. Expose `search(query)` that runs `qmd query <query> --json` and parses results.
- **`tools/memory.ts`**: Two tools:
  - `memory_save(topic, content)` — write to `~/.miniclaw/memory/{topic}.md`, run `qmd embed` to re-index
  - `memory_search(query)` — run `qmd query` and return ranked results

### Setup (one-time):
```bash
npm install -g @tobilu/qmd
qmd collection add ~/.miniclaw/memory --name miniclaw-memory
qmd embed
```

### Verify:
```bash
# Chat with bot, close process, restart, bot remembers prior conversation
# Tell bot "remember that I prefer TypeScript over JavaScript"
# Restart, ask "what language do I prefer?" → bot recalls via qmd search
```

---

## Phase 4: Agent Body Polish (no soul/persona)

**Goal**: Reliable agent infrastructure — typing indicators, error handling, graceful shutdown. The agent is the **body** (tools, memory, transport). The **simulacrum** (persona, soul, skills, personality) is a separate layer we're leaving out for now. The system prompt is minimal and functional — just machine info + tool descriptions.

### Architecture note: Body vs Simulacrum
- **Body (this project)**: LLM connection, tool execution, Telegram transport, conversation history, memory storage. The agent has no personality or opinions — it's a capable shell.
- **Simulacrum (future)**: Persona definition, personality traits, conversation style, proactive behaviors, skills. Loaded as config/plugins on top of the body.

### Files to modify/create:
```
src/
  system-prompt.ts      -- Minimal: machine info + date + tool list. NO personality.
  telegram/
    handlers.ts         -- Add sendChatAction("typing") while agent runs
    send.ts             -- Add streaming: edit message in-place as LLM generates
  index.ts              -- Graceful SIGINT/SIGTERM shutdown
```

### What to extract from OpenClaw:
- **Typing indicator**: From `src/telegram/sendchataction-401-backoff.ts` — send `typing` action periodically while processing. Simplified to a setInterval.
- **Streaming edits**: From `src/telegram/draft-stream.ts` — edit a "thinking..." message with partial content as it streams in. Good UX but optional.
- **Error handling**: From `src/telegram/network-errors.ts` — `isRecoverableTelegramNetworkError` for retry decisions.

### Create default files:
```
~/.miniclaw/
  config.json           -- { "model": "anthropic/claude-sonnet-4-20250514", "maxSteps": 25 }
  memory/               -- Empty dir for notes
  conversations/        -- Empty dir for chat history
```

Note: NO `system-prompt.md` personality file. The system prompt is hardcoded as minimal agent instructions (what tools are available, machine info, date). Persona/soul/skills will be a separate layer added later.

### Verify:
- Agent responds with no personality — just functional tool use
- Bot shows "typing..." while thinking
- `Ctrl+C` stops cleanly without orphaned processes
- Network errors don't crash the bot

---

## Phase 5: Extended Body Capabilities

**Goal**: Web access, image understanding, multi-provider resilience, and scheduled tasks.

### 5a: Web Fetch Tool
```
src/tools/
  web.ts                -- web_fetch: fetch URL, extract readable text (via mozilla/readability or similar)
```
- Agent can read any URL and get clean text back
- Use `node-fetch` + a lightweight HTML-to-text extractor (e.g. `@mozilla/readability` + `linkedom`)
- OpenClaw reference: `src/web/media.ts` for URL fetching patterns

### 5b: Image Handling (Telegram → LLM)
```
src/telegram/
  handlers.ts           -- Handle message:photo, download file via Grammy, pass as image part to agent
```
- When Telegram sends a photo, download it via `bot.api.getFile()` + fetch the file URL
- Pass to Vercel AI SDK as an image content part in the message (Claude/GPT support vision natively)
- OpenClaw reference: `src/agents/tools/image-tool.ts` for image handling patterns

### 5c: Cron Scheduling
```
src/
  scheduler.ts          -- Register recurring tasks, run agent with scheduled prompt
  tools/
    schedule.ts         -- schedule_task, list_tasks, cancel_task tools
```
- Use `node-cron` for cron expressions or simple interval-based scheduling
- Agent can schedule its own tasks: "remind me every morning at 9am", "check this URL every hour"
- Scheduled tasks run the agent loop with a system-injected prompt and send results to Telegram
- Tasks persist in `~/.miniclaw/schedules.json`

### Additional dependencies for Phase 5:
```json
{
  "node-cron": "^3.0",
  "@mozilla/readability": "^0.5",
  "linkedom": "^0.18"
}
```

### Verify:
- Send the agent a URL → it fetches and summarizes the content
- Send a photo in Telegram → agent describes it
- Tell agent "remind me to check email every day at 9am" → schedules persist across restarts

---

## Final File Structure

```
/Users/michaeloneal/development/v2-clean/miniclaw/
  package.json
  tsconfig.json
  .env.example
  .gitignore
  PLAN.md
  src/
    index.ts              -- Entry point
    config.ts             -- Config loading
    auth.ts               -- Claude Max OAuth credential resolution + token refresh
    agent.ts              -- Vercel AI SDK agent loop (Claude only)
    conversation.ts       -- Unified message history
    scheduler.ts          -- Cron-based task scheduling
    system-prompt.ts      -- Minimal system prompt (body, no soul)
    types.ts              -- Shared types
    telegram/
      bot.ts              -- Grammy bot + polling
      handlers.ts         -- Message + photo handlers
      send.ts             -- Chunked sending
      format.ts           -- Markdown → Telegram HTML
    tools/
      shell.ts            -- shell_exec
      files.ts            -- read_file, write_file, list_directory
      web.ts              -- web_fetch (URL → readable text)
      memory.ts           -- memory_save, memory_search (via qmd)
      schedule.ts         -- schedule_task, list_tasks, cancel_task
    memory/
      store.ts            -- Write markdown files to ~/.miniclaw/memory/
      qmd.ts              -- Shell wrapper for qmd CLI (search/index)
```

## Reference Files in OpenClaw (`/tmp/openclaw-research/`)

| Miniclaw File | OpenClaw Reference | What to Extract |
|---|---|---|
| `src/auth.ts` | `src/agents/cli-credentials.ts` | Claude CLI keychain + file credential reading, OAuth token parsing |
| `src/auth.ts` | `src/agents/auth-profiles/oauth.ts` | OAuth token refresh flow |
| `src/auth.ts` | `src/commands/auth-token.ts` | Token validation (`sk-ant-oat01-*` prefix) |
| `src/agent.ts` | `src/agents/pi-embedded-runner/run/attempt.ts` | Flow pattern (replaced with Vercel AI SDK) |
| `src/tools/shell.ts` | `src/agents/bash-tools.ts` | Shell exec concept |
| `src/telegram/bot.ts` | `src/telegram/bot.ts` + `src/telegram/monitor.ts` | Grammy setup + polling loop |
| `src/telegram/handlers.ts` | `src/telegram/bot-handlers.ts` | Message handler registration pattern |
| `src/telegram/send.ts` | `src/telegram/send.ts` | Chunking + HTML send |
| `src/telegram/format.ts` | `src/telegram/format.ts` | Markdown-to-Telegram HTML |
| `src/system-prompt.ts` | `src/agents/system-prompt.ts` | Prompt assembly pattern |
| `src/config.ts` | `.env.example` | Env var naming conventions |

## Runtime Dependencies (10 total)
- `ai`, `@ai-sdk/anthropic` — LLM (Claude Max only)
- `grammy`, `@grammyjs/runner`, `@grammyjs/transformer-throttler` — Telegram
- `dotenv` — env loading (for TELEGRAM_BOT_TOKEN)
- `zod` — schema validation (required by AI SDK tools)
- `node-cron` — cron-based task scheduling
- `@mozilla/readability`, `linkedom` — web page text extraction

## Dev Dependencies
- `vitest` — test runner
- `tsx` — TypeScript execution

## External Tools (installed globally)
- `qmd` (`npm install -g @tobilu/qmd`) — filesystem-based memory search engine

---

## Salvageable Tests from OpenClaw

Tests to adapt from `/tmp/openclaw-research/` for Miniclaw's test suite. Priority: HIGH = directly portable, MEDIUM = needs adaptation.

### HIGH Priority — Directly Portable

| OpenClaw Test File | What it Tests | Miniclaw Target | Notes |
|---|---|---|---|
| `src/telegram/format.test.ts` | `markdownToTelegramHtml` — inline formatting, HTML escaping, lists, headings, blockquotes, code blocks, autolinks, spoilers, file reference wrapping | `src/telegram/format.test.ts` | Pure unit tests, zero external deps. All test cases map directly to our format module. |
| `src/telegram/format.wrap-md.test.ts` | `wrapFileReferencesInHtml`, `renderTelegramHtmlText`, `markdownToTelegramChunks` — TLD vs file extension classification, de-linkification, depth tracking, chunked output | `src/telegram/format.test.ts` (merge) | Also pure unit tests. Important regression tests (e.g. #4071). Merge into single test file. |
| `src/agents/system-prompt-stability.test.ts` | `loadWorkspaceBootstrapFiles` — idempotency, ordering, concurrent access | `src/system-prompt.test.ts` | Tests file-loading stability. Needs temp workspace helper. Only if we keep workspace file injection. |

### MEDIUM Priority — Needs Adaptation

| OpenClaw Test File | What it Tests | Miniclaw Target | Adaptation Needed |
|---|---|---|---|
| `src/telegram/send.test.ts` | `buildInlineKeyboard`, `sendMessageTelegram` — HTML parse fallback, timeout precedence, thread params, caption splitting, media routing | `src/telegram/send.test.ts` | Uses `send.test-harness.ts` that mocks Grammy. Harness is clean and portable. Drop proxy tests, multi-account tests. Keep: chunking, HTML fallback, thread params. |
| `src/agents/bash-tools.test.ts` | `createExecTool` — backgrounding, exit codes, timeout, log slicing | `src/tools/shell.test.ts` | Integration tests that spawn real shells. Drop: elevation controls, session scoping, notifyOnExit. Keep: exit code handling, timeout, basic exec. |
| `src/agents/bash-tools.exec.path.test.ts` | PATH security — blocks `LD_*`/`DYLD_*` injection, strips dangerous env vars | `src/tools/shell.test.ts` (merge) | Security-critical tests worth preserving. Drop sandbox-specific tests. |
| `src/agents/system-prompt.test.ts` | `buildAgentSystemPrompt` — safety guardrails, tool listing, timezone, runtime line, project context | `src/system-prompt.test.ts` | Large file. Cherry-pick: safety section always present, tool listing, runtime line format. Drop: ACP, subagent depth, model aliases, CLI reference, self-update. |

### SKIP — Not Relevant

| OpenClaw Test File | Why Skip |
|---|---|
| `src/telegram/send.proxy.test.ts` | Per-account proxy config not in scope |
| `src/agents/bash-tools.build-docker-exec-args.test.ts` | Docker exec not in scope |
| `src/agents/system-prompt-report.test.ts` | Diagnostic/monitoring layer not in scope |
| `src/agents/system-prompt-params.test.ts` | Repo root detection — minimal value for our simple prompt |

---

## Candidate Utility Tools

Tools from OpenClaw's skill system that could become Miniclaw tools. These are CLI-wrapper tools the agent uses via `shell_exec` — they don't need dedicated TypeScript tool definitions, just system prompt instructions teaching the agent how to call them.

### Implementation approach
Rather than building TypeScript tool wrappers for each, these are **prompt-injected skills**: markdown instructions appended to the system prompt that teach the agent to shell out to the CLI binary. The agent already has `shell_exec` — it just needs to know the CLI exists and how to use it.

Config: `~/.miniclaw/config.json` → `"tools": ["himalaya", "github", "web_search", ...]` → only enabled tools get their instructions injected into the system prompt.

### Candidate List (pending user selection)

#### Communication
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **himalaya** (Email) | `himalaya` | Full IMAP/SMTP: read, search, compose, reply, attachments | `brew install himalaya` | **MEDIUM** — sends email as you. Creds in `~/.config/himalaya/config.toml` (supports keyring). No outbound filtering. |
| **imsg** (iMessage) | `imsg` | Read/send iMessages and SMS (macOS) | `brew install steipete/tap/imsg` | **MEDIUM** — sends messages as you. Needs Full Disk Access + Automation. Reads entire history. |
| **wacli** (WhatsApp) | `wacli` | Send messages, search chats, sync contacts | Go install | **HIGH** — unofficial protocol. Could get account banned. No E2E guarantee. |
| **xurl** (Twitter/X) | `xurl` | Post, reply, search, DMs, media | Custom install | **MEDIUM** — posts publicly as you. OAuth creds in `~/.xurl`. |

#### Web & Search
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **web_search** | (built-in) | Search via Brave/Perplexity API | n/a (API key) | **LOW** — read-only. |
| **web_fetch** | (built-in) | Fetch URL → readable text | n/a | **MEDIUM** — SSRF potential. Needs internal-network blocklist. |
| **summarize** | `summarize` | Summarize URLs, YouTube, PDFs | `brew install steipete/tap/summarize` | **LOW** — read-only. Content goes to LLM API. |

#### RSS & Content
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **blogwatcher** | `blogwatcher` | Track RSS feeds, scan for new posts | Go install | **LOW** — read-only feed fetching. Local DB. |

#### Notes & Knowledge
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **obsidian** | `obsidian-cli` | Search/create/move notes in vault | `brew install obsidian-cli` | **LOW** — plain markdown files. No network. |
| **notion** | (curl) | CRUD pages/databases via REST API | n/a | **LOW** — official API. Scoped token. |

#### Task Management
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **github** | `gh` | PRs, issues, CI, API queries | `brew install gh` | **LOW** — official CLI. Well-scoped OAuth. |
| **apple-reminders** | `remindctl` | Create/complete/list reminders (macOS) | `brew install steipete/tap/remindctl` | **LOW** — local + iCloud sync. |
| **things-mac** | `things` | Read/manage Things 3 todos (macOS) | Go install | **LOW** — reads SQLite, writes via URL scheme. |
| **trello** | (curl) | Manage boards/lists/cards via REST API | n/a | **LOW** — official API. Scoped token. |

#### Terminal & System
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **tmux** | `tmux` | Control sessions, send keys, scrape output | `brew install tmux` | **LOW** — local process control. Same user perms. |
| **peekaboo** (macOS UI) | `peekaboo` | Screenshots, UI inspection, click/type | `brew install steipete/tap/peekaboo` | **MEDIUM** — full screen + UI access. Can see passwords on screen. |
| **healthcheck** | (system CLIs) | Security audit: firewall, ports, SSH, encryption | n/a | **LOW** — read-only inspection. |

#### Secrets & Wallet
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **1password** | `op` | Read secrets, inject into commands | `brew install 1password-cli` | **HIGH** — full password vault access. Biometric gates it but agent can request. Creds exposed to LLM context. |

#### Media
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **spotify-player** | `spogo` | Search, play, pause, device control | Custom install | **LOW** — playback only. No payments. |

#### Weather
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **weather** | (curl) | Current weather + forecasts via wttr.in | n/a | **LOW** — read-only. No API key needed. |

#### Smart Home
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **camsnap** | `camsnap` + `ffmpeg` | Capture frames from RTSP/IP cameras | Custom install | **MEDIUM** — captures video. Config has camera creds. Privacy implications. |

#### Developer
| Tool | Binary | What it does | Install | Security Risk |
|---|---|---|---|---|
| **coding-agent** | `claude`/`codex` | Delegate coding tasks to sub-agents | Various | **MEDIUM** — spawns autonomous agents with filesystem access. |
| **mcporter** (MCP) | `mcporter` | Call any MCP server's tools | `npm install -g mcporter` | **MEDIUM** — bridges to arbitrary MCP servers. Trust depends on config. |
