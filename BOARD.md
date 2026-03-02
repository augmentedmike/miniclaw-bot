# MiniClaw Board — State Machine & Queue System

Everything in this document is derived directly from source code. No guessing.

---

## Board States

```
backlog → in-progress → in-review → shipped
               ↑              |
               └──────────────┘  (sendback allowed, no gates)
```

| State | Meaning |
|---|---|
| `backlog` | Work defined, not yet started |
| `in-progress` | Agent loop is actively working it (lock file exists) |
| `in-review` | Agent completed work, awaiting verification |
| `shipped` | Done. Archived after 7 days. |

**`queued` is deprecated.** It still exists in the state machine for legacy compatibility but the dispatch system never uses it. Dispatch reads directly from `backlog`.

---

## Transition Gates

Gates are enforced by `moveTask()` — no exceptions, no bypasses.

### `backlog → in-progress`

All four checks must pass:

1. **No unresolved blockers** — every ID in `blocked_by` must be in `shipped` state
2. **Non-default project** — `project` field cannot be `"default"`
3. **Title not empty**
4. **All four required sections filled:**

```
## Problem / Work Summary
## Research Planning
## Implementation Plan
## Acceptance Criteria
```

A section is "filled" if it contains non-empty text after stripping HTML comments. The template placeholder comments (`<!-- ... -->`) do NOT count as content.

### `in-progress → in-review`

No content gates. Agent moves the ticket when work is complete.

### `in-review → shipped`

- If type is `epic`: all child tasks must be in `shipped` state

### Sendbacks (any forward → backward)

Always allowed. No gates. Used when an agent hits a blocker mid-work and returns the ticket to backlog.

---

## Ticket Fields

```
id:          auto-assigned integer
title:       required, non-empty
project:     must be set (not "default") before dispatch
type:        chore | bugfix | feature | epic | research
priority:    low | medium | high | critical
size:        small | medium | large | xl
status:      active | on-hold | blocked (computed from blocked_by)
due:         ISO date or null
parent:      epic ID or null
blocked_by:  [] list of task IDs that must ship first
```

Files live at: `~/.miniclaw/user/personas/{active}/kanban/{state}/NNN-slug.md`

---

## Dispatch System

### How it works

`miniclaw-dispatch` is a deterministic, code-based dispatch engine. No LLM decides what runs — the selection logic is pure TypeScript.

**Entry point:** `miniclaw-dispatch run`
**Timer:** launchd plist at `~/Library/LaunchAgents/com.miniclaw.dispatch.plist` (every 5 min)
**Concurrency:** controlled by `dispatchMaxConcurrent` in `~/.miniclaw/system/config.json` (currently `5`)

### Selection algorithm (`selectNextTask()`)

**Phase 1 — Resume interrupted work:**
- Find any `in-progress` tickets with no active lock file
- These are tickets that were running but the agent process died
- Pick highest priority, dispatch first

**Phase 2 — New work from backlog:**
- Filter backlog for: `status != on-hold`, `status != blocked`, `size != large`, `size != xl`
- Run gate check (`checkTransitionGates(id, "in-progress")`) on each candidate
- Collect all that pass
- Sort by: **priority desc** → **due date asc** → **created asc**
- Pick the top ticket

**Large / XL tickets are never auto-dispatched.** They require manual `miniclaw-kanban move <id> in-progress`.

### Concurrency control

Lock files at `~/.miniclaw/dispatch/locks/{id}.lock`

```json
{ "pid": 12345, "taskId": 38, "startedAt": "2026-03-02T01:18:10Z" }
```

`countActiveLocks()` counts lock files where the PID is still alive. Dead PIDs are cleaned up automatically on the next dispatch cycle.

If `activeLocks >= dispatchMaxConcurrent` → cycle exits immediately. No dispatch.

### What runs when a ticket is dispatched

1. Lock acquired (`{id}.lock` written)
2. Loop registered in `~/.miniclaw/run/active-loops.json`
3. Entry written to `~/.miniclaw/run/dispatch-log.json`
4. Ticket moved to `in-progress` on the board
5. Claude Code agent spawned with ticket context
6. Agent works until completion or failure
7. On completion: loop marked `done`, lock released
8. On failure: loop marked `failed`, lock released, ticket may be sent back to `backlog`

### Failure modes

| Error | What happens |
|---|---|
| Claude OAuth expired | Agent fails immediately. Loop marked `failed`. Re-auth: `claude login` |
| Context too long | Agent fails immediately. Reduce board size or ticket body length |
| Agent timeout | Lock file has stale PID. Cleaned on next dispatch cycle. Ticket resumable |
| Gate violation | Ticket not selected. Fix the gate issue, ticket becomes eligible |

---

## Activity Tracking

### `active-loops.json`

`~/.miniclaw/run/active-loops.json`

```json
{
  "loops": [
    {
      "ticketId": 24,
      "ticketTitle": "Install inspect-ai...",
      "sessionKey": "dispatch-24",
      "startedAt": "2026-03-02T01:29:15Z",
      "phase": "running",
      "notes": ""
    }
  ],
  "updated": "2026-03-02T01:29:15Z"
}
```

Phases: `starting` → `running` → `done` | `failed`

**The activity UI badge and `/kanban/activity` right panel read from this file.** If dispatch writes a loop here, the UI sees it within 15 seconds.

### `dispatch-log.json`

`~/.miniclaw/run/dispatch-log.json`

Append-only log of all dispatch events. Capped at 100 entries. Actions:

| Action | Meaning |
|---|---|
| `dispatched` | Ticket selected and agent spawned |
| `loop-done` | Agent completed successfully |
| `loop-failed` | Agent failed with error |

---

## Activity UI

Served at `http://localhost:4200/kanban/activity` (also `/kanban/summary`)

**Left column — Ticket Timeline:** all board state transitions in the last 60 minutes, newest first.

**Right column — Agent Loops & Dispatch:**
- Active loops: animated pulse badge per running agent, showing ticket + phase + elapsed time
- Dispatch log: last 30 entries — dispatched, done, failed events

Refreshes every 15 seconds.

**Stats bar:**
- `TOTAL` — all tickets on the board
- `IN PROGRESS` — tickets in `in-progress` state (board count, not lock count)
- `QUEUED` — tickets in `queued` state (should always be 0)
- `SHIPPED TODAY` — tickets moved to `shipped` today
- `ACTIVE LOOPS` — running entries in `active-loops.json` (lock-based truth)

---

## CLI Reference

```bash
# Board management
miniclaw-kanban add "Title" --project myproject --type bugfix --priority high --size small
miniclaw-kanban list [backlog|in-progress|in-review|shipped]
miniclaw-kanban board                          # summary view
miniclaw-kanban show <id>                      # full ticket detail
miniclaw-kanban move <id> <state>              # enforces gates
miniclaw-kanban check <id> <state>             # check gate readiness without moving
miniclaw-kanban edit <id> --priority critical  # edit fields
miniclaw-kanban fill <id> problem "..."        # fill a required section
miniclaw-kanban fill <id> research "..."
miniclaw-kanban fill <id> implementation "..."
miniclaw-kanban fill <id> acceptance "..."
miniclaw-kanban note <id> "..."                # append a note to body

# Dispatch
miniclaw-dispatch run                          # run one dispatch cycle
miniclaw-dispatch status                       # show active locks + agent PIDs
miniclaw-dispatch logs [id]                    # show agent audit logs
miniclaw-dispatch install --interval 5         # install launchd timer (minutes)
miniclaw-dispatch uninstall                    # remove timer
```

---

## Why tickets don't get dispatched

In order of likelihood:

1. **Required section missing** — run `miniclaw-kanban check <id> in-progress` to see exactly which sections are empty
2. **Project is "default"** — run `miniclaw-kanban edit <id> --project yourproject`
3. **Blocked by unshipped dependency** — run `miniclaw-kanban show <id>` and check `blocked_by`
4. **Size is large or xl** — auto-dispatch only runs `small` and `medium`. Move manually or change size.
5. **Claude OAuth expired** — run `claude login`
6. **At concurrency cap** — `miniclaw-dispatch status` shows active count vs max. Check for stale PIDs.
7. **Status is on-hold** — run `miniclaw-kanban edit <id> --status active`
