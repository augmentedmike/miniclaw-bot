# Temporal Memory Module — Kanban Board

## Context

Miniclaw without task tracking is amnesic between turns. It can't remember what it was working on 30 minutes ago, what's next, how many steps remain, or what shipped yesterday. AM's existing `kanban.md` is a markdown file the agent manually edits — no structure, no guardrails, no state machine. The agent can (and does) hallucinate state changes.

With a structured kanban module, the agent gets:
- **Retrospective data** — what was done, when, in what order
- **Active focus** — what's in progress right now
- **Temporal planning** — what's next, what's blocked, what's waiting for review

This is not a collaborative project board. It's the agent's own internal planner — like working memory with persistence.

## Storage: Folders + Markdown + QMD

Each task is a markdown file. Each state is a folder. Moving a task = moving the file. QMD indexes everything for search.

```
~/.miniclaw/user/personas/{name}/kanban/
  backlog/
    001-fix-auth-bug.md
    002-add-dark-mode.md
  in-progress/
    003-refactor-api.md
  in-review/
    004-new-landing-page.md
  shipped/
    005-setup-ci.md
  _meta.json          # board config: next ID counter, created date
```

### Task file format

```markdown
---
id: 5
title: Setup CI pipeline
priority: high
tags: [infra, devops]
created: 2026-02-28T16:00:00Z
updated: 2026-02-28T18:30:00Z
history:
  - { from: backlog, to: in-progress, at: "2026-02-28T17:00:00Z" }
  - { from: in-progress, to: in-review, at: "2026-02-28T18:00:00Z" }
  - { from: in-review, to: shipped, at: "2026-02-28T18:30:00Z" }
---

# Setup CI pipeline

GitHub Actions workflow for test + build + deploy.

## Notes

- Used reusable workflow pattern
- Deploys to Cloudflare Pages
- PR #47
```

**Why this format:**
- YAML frontmatter = machine-parseable structured fields
- Markdown body = freeform notes the agent (or human) can edit
- History array = full audit trail of state transitions
- File location = current state (single source of truth)
- QMD indexes content for semantic search across all tasks

## State Machine

```
backlog → in-progress → in-review → shipped
             ↑              |
             └──────────────┘  (kicked back)
```

### Valid transitions

| From | To | Notes |
|------|----|-------|
| backlog | in-progress | Start work |
| in-progress | in-review | Ready for testing |
| in-progress | backlog | Deprioritize / park |
| in-review | shipped | Merged / done |
| in-review | in-progress | Kicked back |

### Invalid transitions (rejected by CLI and tools)

- `backlog → shipped` (can't skip work)
- `backlog → in-review` (can't skip work)
- `shipped → *` (shipped is terminal)
- `in-review → backlog` (must go through in-progress)

The state machine prevents the LLM from hallucinating impossible transitions like marking something shipped that was never started.

## Files to Create

| File | Purpose |
|------|---------|
| `src/kanban.ts` | Core: parse, list, add, move, show, search, history, validate transitions |
| `src/kanban-cli.ts` | CLI: add, list, show, move, edit, search, history, board |
| `src/tools/kanban.ts` | Agent tools: kanban_add, kanban_list, kanban_move, kanban_show, kanban_search |
| `tests/kanban.test.ts` | State machine, CRUD, transition validation, file format |

## Files to Modify

| File | Change |
|------|--------|
| `src/agent.ts` | Register kanban tools in `createTools()` |
| `src/config.ts` | Add `kanban/` to `ensurePersonaDirs()` subdirs |
| `src/system-prompt.ts` | Add kanban context section (active tasks, recently shipped) |
| `build.mjs` | Add `kanban-cli.ts` entry point |
| `package.json` | Add `"kanban": "tsx src/kanban-cli.ts"` script |
| `install.sh` | Add `miniclaw-kanban` bin wrapper |

## Core Module: `src/kanban.ts`

### Types

```typescript
type KanbanState = "backlog" | "in-progress" | "in-review" | "shipped";
type Priority = "low" | "medium" | "high" | "critical";

type KanbanTask = {
  id: number;
  title: string;
  state: KanbanState;
  priority: Priority;
  tags: string[];
  created: string;       // ISO
  updated: string;       // ISO
  history: { from: KanbanState; to: KanbanState; at: string }[];
  body: string;          // markdown content below frontmatter
};

type BoardMeta = {
  nextId: number;
  created: string;
};
```

### State machine

```typescript
const VALID_TRANSITIONS: Record<KanbanState, KanbanState[]> = {
  "backlog": ["in-progress"],
  "in-progress": ["in-review", "backlog"],
  "in-review": ["shipped", "in-progress"],
  "shipped": [],  // terminal
};

function validateTransition(from: KanbanState, to: KanbanState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
```

### Functions

- `initBoard()` — create kanban/ dirs + `_meta.json`
- `addTask(title, opts?)` — create task file in `backlog/`, increment ID counter
- `moveTask(id, toState)` — validate transition, move file, append to history
- `getTask(id)` — find task file across all state dirs, parse frontmatter + body
- `listTasks(state?)` — list tasks, optionally filtered by state
- `editTask(id, updates)` — update frontmatter fields (title, priority, tags)
- `appendNote(id, note)` — append to markdown body
- `boardSummary()` — count per column, list in-progress titles (for system prompt)
- `taskHistory(id)` — return transition history
- `searchTasks(query)` — qmd search across kanban/ tree
- `parseTaskFile(content)` — YAML frontmatter + markdown body parser
- `formatTaskFile(task)` — serialize back to frontmatter + body

### File naming

`{id:03d}-{slug}.md` — e.g., `005-setup-ci.md`

Slug derived from title: lowercase, special chars → hyphens, truncated to 40 chars.

## CLI: `src/kanban-cli.ts`

```
miniclaw-kanban add <title> [--priority high] [--tags infra,devops]
miniclaw-kanban list [state]             # list all or filter by column
miniclaw-kanban board                    # summary view: counts per column + in-progress items
miniclaw-kanban show <id>                # full task detail
miniclaw-kanban move <id> <state>        # transition with validation
miniclaw-kanban edit <id> [--title ...] [--priority ...] [--tags ...]
miniclaw-kanban note <id> <text>         # append note
miniclaw-kanban history <id>             # show transition log
miniclaw-kanban search <query>           # qmd search across all tasks
```

## Agent Tools: `src/tools/kanban.ts`

```typescript
kanban_add      — Add a task to backlog
kanban_list     — List tasks (optional state filter)
kanban_move     — Move task to new state (enforces state machine)
kanban_show     — Show full task detail
kanban_search   — Search tasks by content
```

Descriptions tell the agent: "Use kanban_add when you identify work to be done. Use kanban_move when you start, finish, or ship work. Use kanban_list to see what's in progress or what's next."

## System Prompt Integration

Add a `## Current Tasks` section to the system prompt (in `buildSystemPrompt`):

```typescript
// Before the Guidelines section:
const kanbanContext = boardSummary();
// Output:
// ## Current Tasks
// Backlog: 5 | In Progress: 2 | In Review: 1 | Shipped: 12
// Active: #003 refactor-api, #007 fix-telegram-auth
```

This gives the agent awareness of its workload on every turn without needing to call a tool.

## QMD Integration

Register `kanban/` as a qmd collection (`miniclaw-kanban`) alongside the existing `miniclaw-memory` collection. This lets the agent search past tasks:

- "What did I ship last week?"
- "Any tasks related to Telegram?"
- "Show me infrastructure work"

## Verification

1. `npx vitest run tests/kanban.test.ts` — all tests pass
2. `npm run kanban -- add "Test task" --priority high --tags test` — creates file in backlog/
3. `npm run kanban -- list` — shows the task
4. `npm run kanban -- move 1 in-progress` — moves file, updates history
5. `npm run kanban -- move 1 shipped` — rejected (must go through in-review)
6. `npm run kanban -- board` — shows column counts
7. `npm run kanban -- history 1` — shows transition log
8. Agent test: `miniclaw --message "what am I working on?"` — reads kanban context from system prompt
9. Agent test: `miniclaw --message "add a task to fix the login bug"` — uses kanban_add tool
10. `npm run build` — bundles include kanban-cli
