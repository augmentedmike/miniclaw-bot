# miniclaw

> Main agent CLI — multi-channel AI agent powered by Claude.

## Invocation

```bash
# Telegram bot mode (default when TELEGRAM_BOT_TOKEN is set)
miniclaw

# One-shot CLI mode — execute a single message and exit
miniclaw --message "your prompt here"

# Jail to a directory (restricts file operations)
miniclaw /path/to/dir --message "analyze this project"

# Web server mode (chat UI on port 3000, also starts Telegram if configured)
miniclaw serve

# First-time setup
miniclaw setup
```

## Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| Telegram bot | Default (needs `TELEGRAM_BOT_TOKEN`) | Persistent conversational agent via Telegram |
| One-shot CLI | `--message "..."` | Single prompt execution, then exit |
| Web server | `serve` subcommand | Chat UI at `http://localhost:3000` |
| Setup | `setup` subcommand | Interactive initialization |

## Configuration

- **Home directory:** `~/.miniclaw/` (override with `MINICLAW_HOME`)
- **System config:** `~/.miniclaw/system/config.json`
- **Persona config:** `~/.miniclaw/user/personas/<name>/config.json`
- **Environment:** `.env` in working directory and `$MINICLAW_HOME/.env`

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token |
| `ANTHROPIC_API_KEY` | Claude API key |
| `MINICLAW_HOME` | Override default home directory |

## Agent Capabilities

The agent has access to tools for: shell execution, file I/O, glob/grep search, web fetch/search, memory management, vault (encrypted secrets), knowledge base, kanban boards, and Claude Code integration.

## Defaults

- Model: `claude-opus-4-6`
- Max steps per turn: 25
- Shell timeout: 30s
- Conversation limit: 100 messages
