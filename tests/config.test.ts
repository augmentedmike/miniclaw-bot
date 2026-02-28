import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("config", () => {
  let tmpDir: string;
  const originalHome = process.env.HOME;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-cfg-"));
    process.env.HOME = tmpDir;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.MINICLAW_HOME;
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
    expect(config.model).toBe("claude-opus-4-6");
    expect(config.maxSteps).toBe(25);
    expect(config.shellTimeout).toBe(30_000);
    expect(config.conversationLimit).toBe(100);
  });

  it("reads config from system/config.json", async () => {
    const configDir = path.join(tmpDir, ".miniclaw", "system");
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

  it("reads legacy config.json from MINICLAW_HOME root", async () => {
    const configDir = path.join(tmpDir, ".miniclaw");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "config.json"),
      JSON.stringify({ model: "claude-opus-4-20250514" }),
    );
    const { loadConfig } = await import("@src/config.js");
    const config = loadConfig();
    expect(config.model).toBe("claude-opus-4-20250514");
  });

  it("persona config overrides system config", async () => {
    const home = path.join(tmpDir, ".miniclaw");
    // System config
    fs.mkdirSync(path.join(home, "system"), { recursive: true });
    fs.writeFileSync(
      path.join(home, "system", "config.json"),
      JSON.stringify({ model: "system-model", maxSteps: 50 }),
    );
    // Active persona
    fs.mkdirSync(path.join(home, "user", "personas", "custom"), { recursive: true });
    fs.writeFileSync(path.join(home, "user", "active-persona"), "custom");
    fs.writeFileSync(
      path.join(home, "user", "personas", "custom", "config.json"),
      JSON.stringify({ model: "persona-model" }),
    );

    const { loadConfig } = await import("@src/config.js");
    const config = loadConfig();
    expect(config.model).toBe("persona-model");
    // Falls through to system for unset
    expect(config.maxSteps).toBe(50);
  });

  it("reads TELEGRAM_BOT_TOKEN from env", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
    const { loadConfig } = await import("@src/config.js");
    const config = loadConfig();
    expect(config.telegramBotToken).toBe("test-token-123");
  });

  it("MINICLAW_HOME env var overrides default home path", async () => {
    const customDir = path.join(tmpDir, "custom-home");
    process.env.MINICLAW_HOME = customDir;
    const { getMinicawHome, ensureMinicawDirs } = await import("@src/config.js");
    expect(getMinicawHome()).toBe(customDir);
    ensureMinicawDirs();
    expect(fs.existsSync(path.join(customDir, "system", "bin"))).toBe(true);
    expect(fs.existsSync(path.join(customDir, "system", "lib"))).toBe(true);
    expect(fs.existsSync(path.join(customDir, "user", "personas"))).toBe(true);
    expect(fs.existsSync(path.join(customDir, "user", "snapshots"))).toBe(true);
  });

  it("falls back to ~/.miniclaw when MINICLAW_HOME is not set", async () => {
    const { getMinicawHome } = await import("@src/config.js");
    expect(getMinicawHome()).toBe(path.join(tmpDir, ".miniclaw"));
  });

  it("ensureMinicawDirs creates system and user directory structure", async () => {
    const { ensureMinicawDirs, getMinicawHome, getSystemDir, getUserDir } = await import("@src/config.js");
    ensureMinicawDirs();
    const home = getMinicawHome();
    expect(fs.existsSync(home)).toBe(true);
    expect(fs.existsSync(path.join(getSystemDir(), "bin"))).toBe(true);
    expect(fs.existsSync(path.join(getSystemDir(), "lib"))).toBe(true);
    expect(fs.existsSync(path.join(getSystemDir(), "templates"))).toBe(true);
    expect(fs.existsSync(path.join(getUserDir(), "personas"))).toBe(true);
    expect(fs.existsSync(path.join(getUserDir(), "snapshots"))).toBe(true);
  });

  it("ensurePersonaDirs creates self-contained persona structure", async () => {
    const { ensurePersonaDirs, getUserDir } = await import("@src/config.js");
    process.env.MINICLAW_HOME = tmpDir;
    fs.mkdirSync(path.join(tmpDir, "user", "personas"), { recursive: true });

    const personaDir = ensurePersonaDirs("test-agent");
    expect(fs.existsSync(path.join(personaDir, "memory"))).toBe(true);
    expect(fs.existsSync(path.join(personaDir, "conversations"))).toBe(true);
    expect(fs.existsSync(path.join(personaDir, "bin"))).toBe(true);
  });

  it("getActivePersonaHome resolves to active persona directory", async () => {
    const home = path.join(tmpDir, ".miniclaw");
    fs.mkdirSync(path.join(home, "user"), { recursive: true });
    fs.writeFileSync(path.join(home, "user", "active-persona"), "my-agent");

    const { getActivePersonaHome } = await import("@src/config.js");
    expect(getActivePersonaHome()).toBe(path.join(home, "user", "personas", "my-agent"));
  });

  it("getActivePersonaHome defaults to 'default' when no active-persona file", async () => {
    const { getActivePersonaHome } = await import("@src/config.js");
    expect(getActivePersonaHome()).toMatch(/personas\/default$/);
  });

  it("writeActivePersona creates the active-persona file", async () => {
    const home = path.join(tmpDir, ".miniclaw");
    fs.mkdirSync(path.join(home, "user"), { recursive: true });

    const { writeActivePersona, getUserDir } = await import("@src/config.js");
    writeActivePersona("new-agent");

    const content = fs.readFileSync(path.join(getUserDir(), "active-persona"), "utf8");
    expect(content.trim()).toBe("new-agent");
  });

  it("activePersona flows through loadConfig", async () => {
    const home = path.join(tmpDir, ".miniclaw");
    fs.mkdirSync(path.join(home, "user"), { recursive: true });
    fs.writeFileSync(path.join(home, "user", "active-persona"), "configured-agent");

    const { loadConfig } = await import("@src/config.js");
    const config = loadConfig();
    expect(config.activePersona).toBe("configured-agent");
  });
});
