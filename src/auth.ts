import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { OAuthCredentials } from "./types.js";

const CLAUDE_CLI_KEYCHAIN_SERVICE = "Claude Code-credentials";
const CLAUDE_CLI_KEYCHAIN_ACCOUNT = "Claude Code";
const CLAUDE_CLI_CREDENTIALS_PATH = ".claude/.credentials.json";

type ClaudeCliCredential = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function homeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? "~";
}

function parseClaudeOauth(data: unknown): ClaudeCliCredential | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const oauth = obj.claudeAiOauth as Record<string, unknown> | undefined;
  if (!oauth || typeof oauth !== "object") return null;

  const accessToken = oauth.accessToken;
  const refreshToken = oauth.refreshToken;
  const expiresAt = oauth.expiresAt;

  if (typeof accessToken !== "string" || !accessToken) return null;
  if (typeof refreshToken !== "string" || !refreshToken) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;

  return { accessToken, refreshToken, expiresAt };
}

function readFromKeychain(): ClaudeCliCredential | null {
  if (process.platform !== "darwin") return null;
  try {
    const result = execSync(
      `security find-generic-password -s "${CLAUDE_CLI_KEYCHAIN_SERVICE}" -w`,
      { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    );
    return parseClaudeOauth(JSON.parse(result.trim()));
  } catch {
    return null;
  }
}

function readFromFile(): ClaudeCliCredential | null {
  const credPath = path.join(homeDir(), CLAUDE_CLI_CREDENTIALS_PATH);
  try {
    const raw = fs.readFileSync(credPath, "utf8");
    return parseClaudeOauth(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeToKeychain(cred: OAuthCredentials): boolean {
  if (process.platform !== "darwin") return false;
  try {
    // Read existing keychain data to preserve other fields
    const existing = execSync(
      `security find-generic-password -s "${CLAUDE_CLI_KEYCHAIN_SERVICE}" -w`,
      { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    );
    const data = JSON.parse(existing.trim());
    data.claudeAiOauth = {
      ...data.claudeAiOauth,
      accessToken: cred.accessToken,
      refreshToken: cred.refreshToken,
      expiresAt: cred.expiresAt,
    };
    // Use execFileSync to prevent shell injection from token values
    execFileSync(
      "security",
      [
        "add-generic-password", "-U",
        "-s", CLAUDE_CLI_KEYCHAIN_SERVICE,
        "-a", CLAUDE_CLI_KEYCHAIN_ACCOUNT,
        "-w", JSON.stringify(data),
      ],
      { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
}

function writeToFile(cred: OAuthCredentials): boolean {
  const credPath = path.join(homeDir(), CLAUDE_CLI_CREDENTIALS_PATH);
  try {
    const raw = fs.readFileSync(credPath, "utf8");
    const data = JSON.parse(raw);
    data.claudeAiOauth = {
      ...data.claudeAiOauth,
      accessToken: cred.accessToken,
      refreshToken: cred.refreshToken,
      expiresAt: cred.expiresAt,
    };
    fs.writeFileSync(credPath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function writeCredentials(cred: OAuthCredentials): boolean {
  return writeToKeychain(cred) || writeToFile(cred);
}

export function readCredentials(): ClaudeCliCredential | null {
  return readFromKeychain() ?? readFromFile();
}

export function isExpired(cred: ClaudeCliCredential): boolean {
  return Date.now() >= cred.expiresAt;
}

/**
 * Get a valid access token for the Anthropic API.
 * Reads Claude CLI OAuth credentials from keychain or file.
 * Throws if no credentials found or token is expired (refresh not yet implemented).
 */
export async function getAccessToken(): Promise<string> {
  const cred = readCredentials();
  if (!cred) {
    throw new Error(
      "No Claude CLI credentials found. Sign in with Claude CLI first:\n" +
      "  claude login\n" +
      "Requires an active Claude Max/Team/Enterprise subscription.",
    );
  }

  if (!isExpired(cred)) {
    return cred.accessToken;
  }

  // TODO: Implement OAuth token refresh using Anthropic's OAuth endpoint.
  // For now, the user needs to re-auth via Claude CLI if token expires.
  // OpenClaw uses @mariozechner/pi-ai's getOAuthApiKey() for refresh,
  // which we can't use without that dependency. We need to reverse-engineer
  // the refresh endpoint or use a lighter OAuth library.
  throw new Error(
    "Claude CLI OAuth token expired. Re-authenticate:\n" +
    "  claude login\n" +
    "Token expired at: " + new Date(cred.expiresAt).toISOString(),
  );
}
