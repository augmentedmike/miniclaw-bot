import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { MinicawConfig } from "./types.js";

const MINICLAW_HOME = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "~",
  ".miniclaw",
);

const CONFIG_PATH = path.join(MINICLAW_HOME, "config.json");

const DEFAULTS: MinicawConfig = {
  model: "claude-sonnet-4-20250514",
  maxSteps: 25,
  shellTimeout: 30_000,
  conversationLimit: 50,
};

export function getMinicawHome(): string {
  return MINICLAW_HOME;
}

export function ensureMinicawDirs(): void {
  const dirs = [
    MINICLAW_HOME,
    path.join(MINICLAW_HOME, "memory"),
    path.join(MINICLAW_HOME, "conversations"),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): MinicawConfig {
  // Load .env from cwd
  loadDotenv();

  let fileConfig: Partial<MinicawConfig> = {};
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    fileConfig = JSON.parse(raw) as Partial<MinicawConfig>;
  } catch {
    // No config file — use defaults
  }

  return {
    model: fileConfig.model ?? DEFAULTS.model,
    maxSteps: fileConfig.maxSteps ?? DEFAULTS.maxSteps,
    shellTimeout: fileConfig.shellTimeout ?? DEFAULTS.shellTimeout,
    conversationLimit: fileConfig.conversationLimit ?? DEFAULTS.conversationLimit,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? fileConfig.telegramBotToken,
  };
}
