import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We test config loading by mocking HOME and dotenv
describe("config", () => {
  let tmpDir: string;
  const originalHome = process.env.HOME;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-cfg-"));
    process.env.HOME = tmpDir;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (originalToken) {
      process.env.TELEGRAM_BOT_TOKEN = originalToken;
    } else {
      delete process.env.TELEGRAM_BOT_TOKEN;
    }
    vi.resetModules();
  });

  it("returns defaults when no config file exists", async () => {
    const { loadConfig } = await import("@src/config.js");
    const config = loadConfig();
    expect(config.model).toBe("claude-sonnet-4-20250514");
    expect(config.maxSteps).toBe(25);
    expect(config.shellTimeout).toBe(30_000);
    expect(config.conversationLimit).toBe(50);
  });

  it("reads config from config.json", async () => {
    const configDir = path.join(tmpDir, ".miniclaw");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ model: "claude-opus-4-20250514", maxSteps: 10 }),
    );
    const { loadConfig } = await import("@src/config.js");
    const config = loadConfig();
    expect(config.model).toBe("claude-opus-4-20250514");
    expect(config.maxSteps).toBe(10);
    // Defaults still apply for unset values
    expect(config.shellTimeout).toBe(30_000);
  });

  it("reads TELEGRAM_BOT_TOKEN from env", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
    const { loadConfig } = await import("@src/config.js");
    const config = loadConfig();
    expect(config.telegramBotToken).toBe("test-token-123");
  });

  it("ensureMinicawDirs creates directory structure", async () => {
    const { ensureMinicawDirs, getMinicawHome } = await import("@src/config.js");
    ensureMinicawDirs();
    const home = getMinicawHome();
    expect(fs.existsSync(home)).toBe(true);
    expect(fs.existsSync(path.join(home, "memory"))).toBe(true);
    expect(fs.existsSync(path.join(home, "conversations"))).toBe(true);
  });
});
