/**
 * Encrypted secrets vault.
 *
 * AES-256-GCM encrypted storage for API keys, credentials, secure notes,
 * payment cards, crypto keys, and other sensitive data. OS-agnostic
 * (macOS + Linux), never exposes plaintext to disk.
 *
 * Vault file: $MINICLAW_HOME/vault.enc (encrypted JSON)
 * Master key: MINICLAW_VAULT_PASS env var, or $MINICLAW_HOME/.vault-key (chmod 600)
 *
 * Categories: api-key, card, note, crypto, credential
 */

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getActivePersonaHome } from "./config.js";

const VAULT_FILE = "vault.enc";
const KEY_FILE = ".vault-key";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32; // AES-256
const SALT_LEN = 32;
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;

export type VaultCategory = "api-key" | "card" | "note" | "crypto" | "credential";

export type VaultEntry = {
  category: VaultCategory;
  name: string;
  value: string;
  meta?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

type EncryptedEntry = {
  iv: string;    // hex
  tag: string;   // hex
  data: string;  // hex
};

type VaultFile = {
  version: 1;
  salt: string;  // hex
  entries: Record<string, EncryptedEntry>;
};

/**
 * Resolve the master password for vault encryption.
 * Priority: MINICLAW_VAULT_PASS env var > ~/.miniclaw/.vault-key file
 */
export function getMasterPassword(): string | null {
  // 1. Environment variable
  const envPass = process.env.MINICLAW_VAULT_PASS;
  if (envPass && envPass.length > 0) return envPass;

  // 2. Key file
  const keyPath = path.join(getActivePersonaHome(), KEY_FILE);
  try {
    const key = fs.readFileSync(keyPath, "utf8").trim();
    if (key.length > 0) return key;
  } catch {
    // No key file
  }

  return null;
}

/**
 * Initialize the vault key file with a random key.
 * Sets permissions to 600 (owner read/write only).
 */
export function initVaultKey(): string {
  const keyPath = path.join(getActivePersonaHome(), KEY_FILE);
  const key = randomBytes(32).toString("hex");
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

/**
 * Derive an AES-256 key from the master password + salt.
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

/**
 * Encrypt a plaintext string.
 */
function encrypt(plaintext: string, key: Buffer): EncryptedEntry {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

/**
 * Decrypt an encrypted entry.
 */
function decrypt(entry: EncryptedEntry, key: Buffer): string {
  const iv = Buffer.from(entry.iv, "hex");
  const tag = Buffer.from(entry.tag, "hex");
  const data = Buffer.from(entry.data, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}

/**
 * Build the full key for a vault entry: "category/name"
 */
function entryKey(category: VaultCategory, name: string): string {
  return `${category}/${name}`;
}

/**
 * Load the vault file from disk.
 */
function loadVaultFile(): VaultFile | null {
  const vaultPath = path.join(getActivePersonaHome(), VAULT_FILE);
  try {
    const raw = fs.readFileSync(vaultPath, "utf8");
    return JSON.parse(raw) as VaultFile;
  } catch {
    return null;
  }
}

/**
 * Save the vault file to disk (chmod 600).
 */
function saveVaultFile(vault: VaultFile): void {
  const vaultPath = path.join(getActivePersonaHome(), VAULT_FILE);
  fs.writeFileSync(vaultPath, JSON.stringify(vault, null, 2), { mode: 0o600 });
}

/**
 * Create a new empty vault.
 */
function createVault(password: string): { vault: VaultFile; key: Buffer } {
  const salt = randomBytes(SALT_LEN);
  const key = deriveKey(password, salt);
  const vault: VaultFile = {
    version: 1,
    salt: salt.toString("hex"),
    entries: {},
  };
  return { vault, key };
}

/**
 * Open an existing vault or create a new one.
 */
function openVault(password: string): { vault: VaultFile; key: Buffer } {
  const existing = loadVaultFile();
  if (existing) {
    const salt = Buffer.from(existing.salt, "hex");
    const key = deriveKey(password, salt);
    return { vault: existing, key };
  }
  return createVault(password);
}

// --- Public API ---

/**
 * Store a secret in the vault.
 */
export function vaultSet(
  category: VaultCategory,
  name: string,
  value: string,
  meta?: Record<string, string>,
): void {
  const password = getMasterPassword();
  if (!password) throw new Error("No vault password. Set MINICLAW_VAULT_PASS or run vault init.");

  const { vault, key } = openVault(password);
  const k = entryKey(category, name);
  const now = new Date().toISOString();

  const entry: VaultEntry = {
    category,
    name,
    value,
    meta,
    createdAt: vault.entries[k] ? decrypt(vault.entries[k]!, key) : now,
    updatedAt: now,
  };

  // Re-read createdAt from existing if present
  try {
    if (vault.entries[k]) {
      const existing = JSON.parse(decrypt(vault.entries[k]!, key)) as VaultEntry;
      entry.createdAt = existing.createdAt;
    }
  } catch {
    entry.createdAt = now;
  }

  vault.entries[k] = encrypt(JSON.stringify(entry), key);
  saveVaultFile(vault);
}

/**
 * Retrieve a secret from the vault.
 */
export function vaultGet(category: VaultCategory, name: string): VaultEntry | null {
  const password = getMasterPassword();
  if (!password) throw new Error("No vault password. Set MINICLAW_VAULT_PASS or run vault init.");

  const { vault, key } = openVault(password);
  const k = entryKey(category, name);
  const encrypted = vault.entries[k];
  if (!encrypted) return null;

  try {
    return JSON.parse(decrypt(encrypted, key)) as VaultEntry;
  } catch {
    return null;
  }
}

/**
 * Delete a secret from the vault.
 */
export function vaultDelete(category: VaultCategory, name: string): boolean {
  const password = getMasterPassword();
  if (!password) throw new Error("No vault password. Set MINICLAW_VAULT_PASS or run vault init.");

  const { vault } = openVault(password);
  const k = entryKey(category, name);
  if (!vault.entries[k]) return false;

  delete vault.entries[k];

  // Re-derive key to save (need the key for save, not for delete)
  const salt = Buffer.from(vault.salt, "hex");
  deriveKey(password, salt); // validates password
  saveVaultFile(vault);
  return true;
}

/**
 * List all entries in the vault (returns keys and categories, not values).
 */
export function vaultList(category?: VaultCategory): Array<{ category: VaultCategory; name: string }> {
  const password = getMasterPassword();
  if (!password) throw new Error("No vault password. Set MINICLAW_VAULT_PASS or run vault init.");

  const { vault } = openVault(password);
  const results: Array<{ category: VaultCategory; name: string }> = [];

  for (const k of Object.keys(vault.entries)) {
    const [cat, ...nameParts] = k.split("/");
    const name = nameParts.join("/");
    if (!category || cat === category) {
      results.push({ category: cat as VaultCategory, name });
    }
  }

  return results;
}
