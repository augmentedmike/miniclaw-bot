import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { MinicawConfig } from "./types.js";

const MINICLAW_HOME =
  process.env.MINICLAW_HOME ??
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? "~", ".miniclaw");

const DEFAULTS: MinicawConfig = {
  model: "claude-opus-4-6",
  maxSteps: 25,
  shellTimeout: 30_000,
  conversationLimit: 100,
  dispatchMaxConcurrent: 1,
  dispatchIntervalMinutes: 15,
  dispatchMaxSteps: 50,
};

/** Root: ~/.miniclaw */
export function getMinicawHome(): string {
  return MINICLAW_HOME;
}

/** System dir: ~/.miniclaw/system/ — Miniclaw owns, safe to overwrite on install */
export function getSystemDir(): string {
  return path.join(MINICLAW_HOME, "system");
}

/** User dir: ~/.miniclaw/user/ — agent/user owns, never overwritten by install */
export function getUserDir(): string {
  return path.join(MINICLAW_HOME, "user");
}

/**
 * Active persona home: ~/.miniclaw/user/personas/{active}/
 * Self-contained directory with memory/, conversations/, vault.enc, etc.
 * Falls back to "default" if no active persona is set.
 */
export function getActivePersonaHome(config?: MinicawConfig): string {
  const name = config?.activePersona ?? readActivePersona() ?? "default";
  return path.join(getUserDir(), "personas", name);
}

/** Read the active persona name from ~/.miniclaw/user/active-persona */
function readActivePersona(): string | null {
  try {
    return fs.readFileSync(path.join(getUserDir(), "active-persona"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** Write the active persona name to ~/.miniclaw/user/active-persona */
export function writeActivePersona(name: string): void {
  const userDir = getUserDir();
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, "active-persona"), name, "utf8");
}

/** Logs dir: ~/.miniclaw/logs/ */
export function getLogsDir(): string {
  return path.join(MINICLAW_HOME, "logs");
}

/** Create the full directory structure */
export function ensureMinicawDirs(): void {
  const dirs = [
    MINICLAW_HOME,
    // System
    path.join(getSystemDir(), "bin"),
    path.join(getSystemDir(), "lib"),
    path.join(getSystemDir(), "templates"),
    // Logs
    getLogsDir(),
    // User
    getUserDir(),
    path.join(getUserDir(), "personas"),
    path.join(getUserDir(), "snapshots"),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Create a persona's self-contained directory structure */
export function ensurePersonaDirs(name: string): string {
  const personaDir = path.join(getUserDir(), "personas", name);
  const dirs = [
    personaDir,
    path.join(personaDir, "memory"),
    path.join(personaDir, "conversations"),
    path.join(personaDir, "kb"),
    path.join(personaDir, "kanban"),
    path.join(personaDir, "bin"),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return personaDir;
}

/**
 * Load config with layered resolution:
 * 1. Hardcoded defaults
 * 2. System config: ~/.miniclaw/system/config.json
 * 3. Persona config: ~/.miniclaw/user/personas/{active}/config.json
 * 4. Environment variables (highest priority)
 */
export function loadConfig(): MinicawConfig {
  // Load .env from cwd first, then from MINICLAW_HOME as fallback
  loadDotenv();
  loadDotenv({ path: path.join(MINICLAW_HOME, ".env"), override: false });

  // System config
  let systemConfig: Partial<MinicawConfig> = {};
  try {
    const raw = fs.readFileSync(path.join(getSystemDir(), "config.json"), "utf8");
    systemConfig = JSON.parse(raw) as Partial<MinicawConfig>;
  } catch {
    // No system config — try legacy location
    try {
      const raw = fs.readFileSync(path.join(MINICLAW_HOME, "config.json"), "utf8");
      systemConfig = JSON.parse(raw) as Partial<MinicawConfig>;
    } catch {
      // No config file — use defaults
    }
  }

  // Determine active persona name (needed before we can read persona config)
  const activePersona = systemConfig.activePersona ?? readActivePersona() ?? undefined;

  // Persona config
  let personaConfig: Partial<MinicawConfig> = {};
  if (activePersona) {
    try {
      const personaConfigPath = path.join(getUserDir(), "personas", activePersona, "config.json");
      const raw = fs.readFileSync(personaConfigPath, "utf8");
      personaConfig = JSON.parse(raw) as Partial<MinicawConfig>;
    } catch {
      // No persona config — use system/defaults
    }
  }

  return {
    model: personaConfig.model ?? systemConfig.model ?? DEFAULTS.model,
    maxSteps: personaConfig.maxSteps ?? systemConfig.maxSteps ?? DEFAULTS.maxSteps,
    shellTimeout: personaConfig.shellTimeout ?? systemConfig.shellTimeout ?? DEFAULTS.shellTimeout,
    conversationLimit: personaConfig.conversationLimit ?? systemConfig.conversationLimit ?? DEFAULTS.conversationLimit,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? personaConfig.telegramBotToken ?? systemConfig.telegramBotToken,
    activePersona,
    dispatchMaxConcurrent: personaConfig.dispatchMaxConcurrent ?? systemConfig.dispatchMaxConcurrent ?? DEFAULTS.dispatchMaxConcurrent,
    dispatchIntervalMinutes: personaConfig.dispatchIntervalMinutes ?? systemConfig.dispatchIntervalMinutes ?? DEFAULTS.dispatchIntervalMinutes,
    dispatchMaxSteps: personaConfig.dispatchMaxSteps ?? systemConfig.dispatchMaxSteps ?? DEFAULTS.dispatchMaxSteps,
    dispatchWorkDir: personaConfig.dispatchWorkDir ?? systemConfig.dispatchWorkDir,
  };
}
