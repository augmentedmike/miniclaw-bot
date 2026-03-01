/**
 * Vault CLI — manage encrypted secrets.
 *
 * Usage:
 *   npx tsx src/vault-cli.ts init              Create vault key
 *   npx tsx src/vault-cli.ts set <cat> <name>  Store a secret (prompts for value)
 *   npx tsx src/vault-cli.ts set <cat> <name> --value "secret"  Non-interactive
 *   npx tsx src/vault-cli.ts get <cat> <name>  Retrieve a secret
 *   npx tsx src/vault-cli.ts list [cat]        List entries
 *   npx tsx src/vault-cli.ts delete <cat> <name>  Delete an entry
 *
 * Categories: api-key, card, note, crypto, credential
 *
 * Flags (set command):
 *   --value "..."       Secret value (skips interactive prompt)
 *   --meta "k=v,k=v"   Metadata (skips interactive prompt)
 */

import { vaultSet, vaultGet, vaultDelete, vaultList, initVaultKey, getMasterPassword } from "./vault.js";
import { ensureMinicawDirs, getActivePersonaHome } from "./config.js";
import type { VaultCategory } from "./vault.js";
import * as readline from "node:readline";

const CATEGORIES = ["api-key", "card", "note", "crypto", "credential"] as const;

function usage(): never {
  console.log(`
Vault — encrypted secrets manager

Commands:
  init                    Generate vault encryption key
  set <category> <name>   Store a secret (prompts for value)
  get <category> <name>   Retrieve a secret value
  list [category]         List stored entries
  delete <category> <name>  Remove an entry

Flags (set):
  --value "..."           Secret value (skip interactive prompt)
  --meta "k=v,k=v"        Metadata (skip interactive prompt)

Categories: ${CATEGORIES.join(", ")}

Environment:
  MINICLAW_VAULT_PASS   Master password (or use 'init' to create key file)
`.trim());
  process.exit(1);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Extract --flag "value" pairs from args, returning { flags, positional }. */
function parseFlags(args: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[++i];
    } else {
      positional.push(args[i]);
    }
  }
  return { flags, positional };
}

function handleInit(): void {
  const key = initVaultKey();
  console.log("Vault key created.");
  console.log(`Stored in ${getActivePersonaHome()}/.vault-key (chmod 600)`);
}

async function handleSet(args: string[]): Promise<void> {
  const { flags, positional } = parseFlags(args);
  const [cat, name] = positional;
  if (!cat || !name) usage();
  if (!CATEGORIES.includes(cat as VaultCategory)) {
    console.error(`Invalid category: ${cat}. Must be one of: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const value = flags.value ?? await prompt("Value: ");
  if (!value) {
    console.error("Empty value, aborting.");
    process.exit(1);
  }

  const metaInput = flags.meta ?? (flags.value ? "" : await prompt("Metadata (key=val,key=val or blank): "));
  const meta = metaInput
    ? Object.fromEntries(metaInput.split(",").map((p) => p.trim().split("=")).filter((p) => p.length === 2) as [string, string][])
    : undefined;

  vaultSet(cat as VaultCategory, name, value, meta && Object.keys(meta).length > 0 ? meta : undefined);
  console.log(`Stored: ${cat}/${name}`);
}

function handleGet(args: string[]): void {
  const [cat, name] = args;
  if (!cat || !name) usage();
  const entry = vaultGet(cat as VaultCategory, name);
  if (!entry) {
    console.error(`Not found: ${cat}/${name}`);
    process.exit(1);
  }
  // Output value to stdout (safe for piping)
  process.stdout.write(entry.value);
  if (entry.meta) {
    console.error("\nMetadata:", JSON.stringify(entry.meta));
  }
}

function handleList(args: string[]): void {
  const [cat] = args;
  const entries = vaultList(cat as VaultCategory | undefined);
  if (entries.length === 0) {
    console.log("Vault is empty.");
  } else {
    for (const e of entries) {
      console.log(`${e.category}/${e.name}`);
    }
  }
}

function handleDelete(args: string[]): void {
  const [cat, name] = args;
  if (!cat || !name) usage();
  const deleted = vaultDelete(cat as VaultCategory, name);
  if (deleted) {
    console.log(`Deleted: ${cat}/${name}`);
  } else {
    console.error(`Not found: ${cat}/${name}`);
    process.exit(1);
  }
}

async function main() {
  ensureMinicawDirs();

  const [command, ...args] = process.argv.slice(2);

  if (!command) usage();

  switch (command) {
    case "init":    handleInit(); break;
    case "set":     await handleSet(args); break;
    case "get":     handleGet(args); break;
    case "list":    handleList(args); break;
    case "delete":  handleDelete(args); break;
    default:        usage();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
