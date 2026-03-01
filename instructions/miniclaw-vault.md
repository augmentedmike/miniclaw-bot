# miniclaw-vault

> Encrypted secrets manager — store and retrieve sensitive values.

## Commands

```bash
# Initialize vault (generates encryption key)
miniclaw-vault init

# Store a secret (prompts for value on stdin)
miniclaw-vault set <category> <name>

# Retrieve a secret
miniclaw-vault get <category> <name>

# List all entries, or filter by category
miniclaw-vault list
miniclaw-vault list api-key

# Delete an entry
miniclaw-vault delete <category> <name>
```

## Categories

| Category | Use for |
|----------|---------|
| `api-key` | API tokens, service keys |
| `credential` | Usernames, passwords, auth pairs |
| `card` | Payment card details |
| `note` | Freeform sensitive text |
| `crypto` | Wallet keys, seed phrases |

## Environment

| Variable | Purpose |
|----------|---------|
| `MINICLAW_VAULT_PASS` | Master password (alternative to key file from `init`) |

## Agent Workflow

```bash
# Store an API key received from the user
miniclaw-vault set api-key openai-key

# Retrieve it later for use
miniclaw-vault get api-key openai-key

# Check what's stored
miniclaw-vault list
```

## Notes

- Run `init` once before first use — creates the encryption key file.
- Values are prompted interactively on stdin, never passed as arguments.
- The vault encrypts at rest. Never log or echo secret values.
