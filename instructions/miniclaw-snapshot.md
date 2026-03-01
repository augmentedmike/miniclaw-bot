# miniclaw-snapshot

> State export/restore — save and restore full agent state.

## Commands

```bash
# Export current state as a .tar.gz archive
miniclaw-snapshot export
miniclaw-snapshot export my-checkpoint

# List available snapshots
miniclaw-snapshot list

# Show what's inside a snapshot
miniclaw-snapshot show <file>

# Restore from a snapshot archive
miniclaw-snapshot restore <file>
miniclaw-snapshot restore <file> --dir /custom/path
```

## What Gets Snapshotted

A snapshot captures the full `~/.miniclaw/` state:
- All personas (identity, config, KB data)
- Vault (encrypted secrets)
- System config
- Kanban board state

## Options

| Flag | Purpose |
|------|---------|
| `--dir <path>` | Target directory for restore (default: `~/.miniclaw`) |

## Agent Workflow

```bash
# Save state before a risky operation
miniclaw-snapshot export pre-refactor

# Check available restore points
miniclaw-snapshot list

# Inspect a snapshot before restoring
miniclaw-snapshot show snapshots/pre-refactor.tar.gz

# Roll back if needed
miniclaw-snapshot restore snapshots/pre-refactor.tar.gz
```

## Notes

- Snapshots are `.tar.gz` archives stored in `~/.miniclaw/user/snapshots/`.
- Export before destructive operations as a safety net.
- Restore overwrites current state — snapshot first if you want to preserve it.
