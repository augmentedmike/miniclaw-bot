# miniclaw-kanban

> Agent task board — track work items through a state machine.

## Commands

```bash
# Add a task (starts in backlog)
miniclaw-kanban add "Implement user auth"
miniclaw-kanban add "Fix login bug" --priority high --tags auth,bugfix

# View the board (counts per column + in-progress items)
miniclaw-kanban board

# List tasks (optionally filter by state)
miniclaw-kanban list
miniclaw-kanban list in-progress

# Show full detail for a task
miniclaw-kanban show <id>

# Move a task through the pipeline
miniclaw-kanban move <id> in-progress
miniclaw-kanban move <id> in-review
miniclaw-kanban move <id> shipped

# Edit task fields
miniclaw-kanban edit <id> --title "New title"
miniclaw-kanban edit <id> --priority critical
miniclaw-kanban edit <id> --tags backend,urgent

# Append a note to a task
miniclaw-kanban note <id> "Found the root cause — null check missing"

# View transition history
miniclaw-kanban history <id>

# Search tasks by title, body, or tags
miniclaw-kanban search "auth"
```

## States

```
backlog → in-progress → in-review → shipped
```

Transitions are enforced — you can't skip states (e.g., backlog directly to shipped).

## Flags

| Flag | Used with | Values |
|------|-----------|--------|
| `--priority` | `add`, `edit` | `low`, `medium`, `high`, `critical` |
| `--tags` | `add`, `edit` | Comma-separated (e.g., `auth,backend`) |
| `--title` | `edit` | New title string |

## Agent Workflow

```bash
# Start a work session — check the board
miniclaw-kanban board

# Pick up a task
miniclaw-kanban move <id> in-progress

# Log progress as you work
miniclaw-kanban note <id> "Completed API endpoint, starting tests"

# Mark done
miniclaw-kanban move <id> in-review
miniclaw-kanban move <id> shipped

# Add new work discovered during implementation
miniclaw-kanban add "Add rate limiting to auth endpoint" --tags auth,security
```

## Notes

- Always check `board` at the start of a session to see current state.
- Use `note` to leave breadcrumbs — helpful for continuity across sessions.
- Tags enable fast filtering; use them generously.
