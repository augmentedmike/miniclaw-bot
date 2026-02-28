# Feature Map — miniclaw v0.1.0

> 17 features | 43 source files | 60 capabilities

## Agent Personas

Named agent profiles with custom instructions, personality, and per-persona memory. Switch between identities for different use cases.

**Capabilities:**
- Convenience accessor — opens a KBEngine for the active persona
- Parse markdown content into a Persona object

**Files:** `kb/index.ts`, `persona.ts`

## AI Assistant

Conversational AI agent that reasons through problems step-by-step, uses tools to take action, and maintains context across interactions.

**Capabilities:**
- Claude language model (Anthropic)
- Multi-step reasoning with tool use
- Structured tool parameter validation
- Local embedding via @huggingface/transformers

**Files:** `agent.ts`, `index.ts`, `kb/embeddings.ts`, `system-prompt.ts`

**Dependencies:** @ai-sdk/anthropic, ai, zod

## Authentication

OAuth token management for LLM provider access. Supports Claude Code credential fallback and automatic token handling.

**Files:** `auth.ts`

## Code Search

Search file contents using regular expressions with ripgrep. Returns matching lines with file paths and line numbers.

**Capabilities:**
- grep
- Search file contents for a regex pattern using ripgrep (rg)

**Files:** `tools/grep.ts`

## Configuration

Environment-based configuration with sensible defaults. Model selection, timeout settings, home directory, and persona management.

**Capabilities:**
- Environment variable loading

**Files:** `config.ts`

**Dependencies:** dotenv

## Conversation History

Maintains per-user conversation context so the agent picks up where it left off. Old messages are automatically archived to the knowledge base when rotated out.

**Files:** `conversation.ts`

## Encrypted Vault

Securely store and retrieve sensitive data — API keys, payment cards, crypto keys, credentials, and secure notes. AES-256 encrypted, never exposed in plaintext. Works on macOS and Linux.

**Capabilities:**
- vault get
- vault list
- Vault tools for the agent
- Retrieve a secret from the encrypted vault
- List available secrets in the vault by category
- Encrypted secrets vault

**Files:** `tools/vault.ts`, `vault.ts`

## File Management

Read, write, edit, and search files on the host system. Supports glob patterns, directory listings, and precise string-replacement editing.

**Capabilities:**
- read file
- write file
- edit file
- list directory
- glob
- Make a precise edit to a file by replacing an exact string match
- Read the contents of a file
- Write content to a file
- List contents of a directory
- Find files matching a glob pattern

**Files:** `tools/edit.ts`, `tools/files.ts`, `tools/glob.ts`

## Installation & Setup

Interactive installer that walks through first-time setup including persona creation and configuration.

**Capabilities:**
- Interactive Miniclaw installer TUI

**Files:** `install-tui.ts`, `setup.ts`

## Knowledge Base

Automatic context retrieval before each response. Searches stored knowledge using BM25 ranking and vector similarity to provide relevant background.

**Capabilities:**
- Pre-turn: search KB for context relevant to the current message
- Knowledge Base engine — SQLite + sqlite-vec + FTS5
- Knowledge Base tools for the agent
- Add an entry to the knowledge base
- Search the knowledge base using hybrid semantic + keyword search
- List entries in the knowledge base, optionally filtered by category
- Remove an entry from the knowledge base by ID

**Files:** `context.ts`, `kb/engine.ts`, `tools/kb.ts`

## Persistent Memory

Remembers facts, preferences, and notes across conversations and restarts. Supports keyword search, semantic similarity search, and deep multi-strategy search for the best results.

**Capabilities:**
- memory save
- memory search
- memory vector search
- memory deep search
- Require qmd CLI
- Save a piece of information to long-term memory
- Search long-term memory using keyword matching (BM25 ranked)
- Search long-term memory using semantic vector similarity
- Deep search of long-term memory combining keywords, semantic vectors, query expansion, and LLM re-ranking

**Files:** `memory/search.ts`, `memory/store.ts`, `tools/memory.ts`

## State Snapshots

Export and restore complete agent state — like a checkpoint. Backup persona, memory, conversations, and vault to a portable archive.

**Capabilities:**
- Snapshot — export/restore complete agent state

**Files:** `snapshot.ts`

## System Access

Execute shell commands on the host machine with the user's full environment. Supports configurable timeouts and optional directory sandboxing.

**Capabilities:**
- shell exec
- Spawn a process, buffer stdout/stderr, and resolve with a formatted string
- Check if a shell command tries to escape the jail by referencing absolute paths outside it, using relative traversal, or other escapes
- Execute a shell command and return its output

**Files:** `tools/run-process.ts`, `tools/shell.ts`

## Task Delegation

Delegate complex multi-step tasks to Claude Code, an autonomous coding agent with full filesystem and shell access.

**Capabilities:**
- claude code
- Claude Code tool — delegates complex tasks to Claude Code CLI
- Delegate a complex task to Claude Code (an AI coding agent with full filesystem, shell, web search, and code editing capabilities)

**Files:** `tools/claude-code.ts`

## Telegram Messaging

Send and receive messages through a Telegram bot. Supports long messages, rich formatting, and typing indicators. First user to connect becomes the owner.

**Capabilities:**
- Long-polling message listener
- Rate limiting for API calls
- Telegram bot message handling
- Telegram access control — first-to-connect-owns-the-bot pattern
- Markdown → Telegram HTML conversion
- Send a potentially long text message to a Telegram chat

**Files:** `telegram/access.ts`, `telegram/bot.ts`, `telegram/format.ts`, `telegram/handlers.ts`, `telegram/send.ts`

**Dependencies:** @grammyjs/runner, @grammyjs/transformer-throttler, grammy

## Web Access

Fetch web pages and search the internet. Reads articles, documentation, and API responses. Searches via DuckDuckGo with no API key required.

**Capabilities:**
- web fetch
- web search
- Fetch a URL and return its content as readable text
- Search the web and return results

**Files:** `tools/web.ts`

## Web Interface

Browser-based UI for interacting with the agent. HTTP server with route handling and UI components.

**Files:** `web/handler.ts`, `web/server.ts`, `web/ui.ts`
