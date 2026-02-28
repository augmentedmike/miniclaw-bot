import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;
const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

vi.mock("@src/config.js", () => ({
  getMinicawHome: () => tmpDir,
  getActivePersonaHome: () => tmpDir,
}));

describe("vault tools", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-vaultool-"));
    process.env.MINICLAW_VAULT_PASS = "test-password";
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.MINICLAW_VAULT_PASS;
    vi.resetModules();
  });

  it("vault_get retrieves stored secrets", async () => {
    const { vaultSet } = await import("@src/vault.js");
    vaultSet("api-key", "gemini", "AIza-test");

    const { vaultGetTool } = await import("@tools/vault.js");
    const result = await vaultGetTool.execute({ category: "api-key", name: "gemini" }, ctx);
    expect(result).toContain("AIza-test");
  });

  it("vault_get shows available names when not found", async () => {
    const { vaultSet } = await import("@src/vault.js");
    vaultSet("api-key", "openai", "sk-xxx");

    const { vaultGetTool } = await import("@tools/vault.js");
    const result = await vaultGetTool.execute({ category: "api-key", name: "gemini" }, ctx);
    expect(result).toContain("not found");
    expect(result).toContain("openai");
  });

  it("vault_get reports empty category", async () => {
    const { vaultGetTool } = await import("@tools/vault.js");
    const result = await vaultGetTool.execute({ category: "crypto", name: "btc" }, ctx);
    expect(result).toContain("not found");
    expect(result).toContain("No secrets stored");
  });

  it("vault_list shows all entries", async () => {
    const { vaultSet } = await import("@src/vault.js");
    vaultSet("api-key", "gemini", "key1");
    vaultSet("note", "memo", "hello");

    const { vaultListTool } = await import("@tools/vault.js");
    const result = await vaultListTool.execute({ category: undefined }, ctx);
    expect(result).toContain("api-key/gemini");
    expect(result).toContain("note/memo");
  });

  it("vault_list filters by category", async () => {
    const { vaultSet } = await import("@src/vault.js");
    vaultSet("api-key", "gemini", "key1");
    vaultSet("note", "memo", "hello");

    const { vaultListTool } = await import("@tools/vault.js");
    const result = await vaultListTool.execute({ category: "api-key" }, ctx);
    expect(result).toContain("api-key/gemini");
    expect(result).not.toContain("note/memo");
  });

  it("vault_list shows empty message", async () => {
    const { vaultListTool } = await import("@tools/vault.js");
    const result = await vaultListTool.execute({ category: undefined }, ctx);
    expect(result).toContain("empty");
  });
});
