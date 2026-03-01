# miniclaw-kb

> Knowledge base — local vector database for storing and retrieving world knowledge.

## Commands

```bash
# Add an entry
miniclaw-kb add <category> "<content>" [flags]

# Search (hybrid: vector similarity + keyword)
miniclaw-kb search "<query>"
miniclaw-kb search "<query>" --origin procedure

# List entries (optionally filter)
miniclaw-kb list
miniclaw-kb list fact
miniclaw-kb list --origin inferred

# Get full entry by ID
miniclaw-kb get <id>

# Remove an entry
miniclaw-kb remove <id>

# Import existing memory/*.md files as KB entries
miniclaw-kb import-memory

# Export/import KB as JSON
miniclaw-kb export
miniclaw-kb export backup.json
miniclaw-kb import backup.json

# Statistics overview
miniclaw-kb stats

# Regenerate all vector embeddings
miniclaw-kb rebuild-embeddings
```

## Categories

| Category | Use for |
|----------|---------|
| `fact` | Verified world knowledge — research findings, confirmed truths |
| `general` | Broad observations, context, notes |
| `procedure` | How-to knowledge — workflows, processes, step-by-step methods |
| `personality` | Self-knowledge — identity, preferences, values, communication style |

## Flags

| Flag | Purpose | Example |
|------|---------|---------|
| `--origin` | How knowledge was acquired | `scholastic`, `human`, `observed`, `read`, `inferred`, `imported` |
| `--confidence` | Certainty score 0–1 | `0.8` |
| `--volatility` | Change likelihood | `stable`, `temporal`, `versioned` |
| `--expires` | Expiry for temporal entries | `2026-03-15` |
| `--source` | Provenance URL/path/ref | `https://sqlite.org/wal.html` |
| `--tags` | Comma-separated topic tags | `sqlite,databases` |

## Origins

| Origin | Use when |
|--------|----------|
| `scholastic` | Learned from structured study or documentation |
| `observed` | Noticed through interaction or experience |
| `read` | Extracted from reading articles, docs, web pages |
| `inferred` | Concluded through reasoning or self-reflection |
| `human` | Told directly by the user |
| `imported` | Bulk imported from files |

## Agent Workflow

```bash
# Store a research finding
miniclaw-kb add fact "SQLite WAL mode allows concurrent reads during writes" \
  --origin read --source "https://sqlite.org/wal.html" --tags sqlite,databases

# Record a self-reflection
miniclaw-kb add personality "I work best when I break large tasks into small verifiable steps" \
  --origin inferred --confidence 0.8 --tags workflow,self-knowledge

# Save a procedure
miniclaw-kb add procedure "To deploy miniclaw: run npm run build, then bash install.sh" \
  --origin observed --tags deployment,miniclaw

# Store time-bound knowledge
miniclaw-kb add fact "Project deadline is March 15 2026" \
  --origin human --volatility temporal --expires 2026-03-15

# Search before adding (avoid duplicates)
miniclaw-kb search "database concurrency"

# Review what you know
miniclaw-kb stats
miniclaw-kb list fact
miniclaw-kb list --origin inferred
```

## Best Practices

- **Always set origin** — tracks provenance, enables filtering by how you learned something.
- **Use confidence scores** — lower (0.3–0.6) for inferences, higher (0.8–1.0) for confirmed facts.
- **Tag generously** — enables fast filtering. Use topic tags like `sqlite`, `javascript`, `user-prefs`.
- **Set source** — record URLs, conversation IDs, file paths for traceability.
- **Use temporal + expires** for time-bound facts (deadlines, versions, schedules).
- **Search before adding** — avoid duplicates.
- **Rebuild embeddings** after bulk imports: `miniclaw-kb rebuild-embeddings`.
