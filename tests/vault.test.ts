import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
  getActivePersonaHome: () => tmpDir,
}));

describe("vault", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-vault-"));
    process.env.MINICLAW_VAULT_PASS = "test-master-password-123";
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.MINICLAW_VAULT_PASS;
    vi.resetModules();
  });

  it("stores and retrieves a secret", async () => {
    const { vaultSet, vaultGet } = await import("@src/vault.js");
    vaultSet("api-key", "gemini", "AIza-test-key-12345");
    const entry = vaultGet("api-key", "gemini");
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe("AIza-test-key-12345");
    expect(entry!.category).toBe("api-key");
    expect(entry!.name).toBe("gemini");
  });

  it("stores metadata with entries", async () => {
    const { vaultSet, vaultGet } = await import("@src/vault.js");
    vaultSet("card", "visa-1234", "4111111111111111", { expiry: "12/26", cvv: "123" });
    const entry = vaultGet("card", "visa-1234");
    expect(entry!.meta).toEqual({ expiry: "12/26", cvv: "123" });
  });

  it("returns null for missing entries", async () => {
    const { vaultGet } = await import("@src/vault.js");
    const entry = vaultGet("api-key", "nonexistent");
    expect(entry).toBeNull();
  });

  it("lists entries by category", async () => {
    const { vaultSet, vaultList } = await import("@src/vault.js");
    vaultSet("api-key", "gemini", "key1");
    vaultSet("api-key", "openai", "key2");
    vaultSet("note", "server-creds", "user:pass");

    const apiKeys = vaultList("api-key");
    expect(apiKeys).toHaveLength(2);
    expect(apiKeys.map((e) => e.name)).toContain("gemini");
    expect(apiKeys.map((e) => e.name)).toContain("openai");

    const all = vaultList();
    expect(all).toHaveLength(3);
  });

  it("deletes entries", async () => {
    const { vaultSet, vaultGet, vaultDelete } = await import("@src/vault.js");
    vaultSet("api-key", "temp", "temporary-key");
    expect(vaultGet("api-key", "temp")).not.toBeNull();

    const deleted = vaultDelete("api-key", "temp");
    expect(deleted).toBe(true);
    expect(vaultGet("api-key", "temp")).toBeNull();
  });

  it("returns false when deleting non-existent entry", async () => {
    const { vaultDelete } = await import("@src/vault.js");
    expect(vaultDelete("api-key", "nope")).toBe(false);
  });

  it("updates existing entries preserving createdAt", async () => {
    const { vaultSet, vaultGet } = await import("@src/vault.js");
    vaultSet("api-key", "test", "v1");
    const first = vaultGet("api-key", "test");

    vaultSet("api-key", "test", "v2");
    const second = vaultGet("api-key", "test");

    expect(second!.value).toBe("v2");
    expect(second!.createdAt).toBe(first!.createdAt);
    expect(second!.updatedAt).not.toBe(first!.updatedAt);
  });

  it("fails without master password", async () => {
    delete process.env.MINICLAW_VAULT_PASS;
    const { vaultSet } = await import("@src/vault.js");
    expect(() => vaultSet("api-key", "test", "val")).toThrow("No vault password");
  });

  it("creates vault file with restricted permissions", async () => {
    const { vaultSet } = await import("@src/vault.js");
    vaultSet("api-key", "test", "val");
    const vaultPath = path.join(tmpDir, "vault.enc");
    expect(fs.existsSync(vaultPath)).toBe(true);

    const stat = fs.statSync(vaultPath);
    // Check owner-only permissions (0o600 = rw-------)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("encrypts data at rest (not plaintext)", async () => {
    const { vaultSet } = await import("@src/vault.js");
    vaultSet("api-key", "secret", "super-secret-value-xyz");
    const vaultPath = path.join(tmpDir, "vault.enc");
    const raw = fs.readFileSync(vaultPath, "utf8");
    expect(raw).not.toContain("super-secret-value-xyz");
  });

  it("cannot decrypt with wrong password", async () => {
    const { vaultSet } = await import("@src/vault.js");
    vaultSet("api-key", "test", "correct-value");

    // Change password
    process.env.MINICLAW_VAULT_PASS = "wrong-password";
    vi.resetModules();
    const { vaultGet: vaultGetWrong } = await import("@src/vault.js");

    // Should return null (decryption fails)
    const entry = vaultGetWrong("api-key", "test");
    expect(entry).toBeNull();
  });

  it("initializes vault key file", async () => {
    const { initVaultKey } = await import("@src/vault.js");
    const key = initVaultKey();
    expect(key).toHaveLength(64); // 32 bytes hex
    const keyPath = path.join(tmpDir, ".vault-key");
    expect(fs.existsSync(keyPath)).toBe(true);
    expect(fs.readFileSync(keyPath, "utf8").trim()).toBe(key);
  });

  it("reads master password from key file when env not set", async () => {
    delete process.env.MINICLAW_VAULT_PASS;
    // Write a key file
    const keyPath = path.join(tmpDir, ".vault-key");
    fs.writeFileSync(keyPath, "file-based-password", { mode: 0o600 });

    vi.resetModules();
    const { getMasterPassword } = await import("@src/vault.js");
    expect(getMasterPassword()).toBe("file-based-password");
  });
});
