/**
 * Vault CLI — manage encrypted secrets.
 *
 * Usage:
 *   npx tsx src/vault-cli.ts init              Create vault key
 *   npx tsx src/vault-cli.ts set <cat> <name>  Store a secret (reads from stdin)
 *   npx tsx src/vault-cli.ts get <cat> <name>  Retrieve a secret
 *   npx tsx src/vault-cli.ts list [cat]        List entries
 *   npx tsx src/vault-cli.ts delete <cat> <name>  Delete an entry
 *
 * Categories: api-key, card, note, crypto, credential
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

function handleInit(): void {
  const key = initVaultKey();
  console.log("Vault key created. Key (first 8 chars):", key.slice(0, 8) + "...");
  console.log(`Stored in ${getActivePersonaHome()}/.vault-key (chmod 600)`);
}

async function handleSet(args: string[]): Promise<void> {
  const [cat, name] = args;
  if (!cat || !name) usage();
  if (!CATEGORIES.includes(cat as VaultCategory)) {
    console.error(`Invalid category: ${cat}. Must be one of: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const value = await prompt("Value: ");
  if (!value) {
    console.error("Empty value, aborting.");
    process.exit(1);
  }

  const metaInput = await prompt("Metadata (key=val,key=val or blank): ");
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
