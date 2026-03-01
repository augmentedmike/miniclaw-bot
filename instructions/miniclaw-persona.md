# miniclaw-persona

> Agent identity management — create, switch, and manage personas.

## Commands

```bash
# Create a new persona from the default template
miniclaw-persona create <name>

# Clone from an existing persona
miniclaw-persona create <name> --from <other>

# List all personas (* marks active)
miniclaw-persona list

# Show persona content (default: active persona)
miniclaw-persona show
miniclaw-persona show <name>

# Switch active persona
miniclaw-persona select <name>

# Print active persona name
miniclaw-persona active

# Open persona.md in $EDITOR
miniclaw-persona edit <name>

# Import a persona.md from an external path
miniclaw-persona import <file>

# Delete a persona (refuses if it's the active one)
miniclaw-persona delete <name>
```

## Persona Structure

Each persona lives at `~/.miniclaw/user/personas/<name>/` and contains:
- `persona.md` — Identity document (personality, voice, values, goals, memories)
- `config.json` — Persona-specific configuration overrides
- `kb/` — Persona-scoped knowledge base

## Agent Workflow

```bash
# Check who you are
miniclaw-persona active

# Read your identity
miniclaw-persona show

# Create a specialized persona for a project
miniclaw-persona create researcher --from default

# Switch context
miniclaw-persona select researcher
```

## Notes

- The active persona determines which identity, config, and KB the agent uses.
- Persona content is markdown — agents can read and reason about their own identity.
- Use `--from` to clone an existing persona as a starting point.
