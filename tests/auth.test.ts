import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync as realExecSync, execFileSync as realExecFileSync } from "node:child_process";

// Set up mock for child_process that defaults to real implementations
const mockExecSync = vi.fn((...args: unknown[]) => realExecSync(...args as Parameters<typeof realExecSync>));
const mockExecFileSync = vi.fn((...args: unknown[]) => realExecFileSync(...args as Parameters<typeof realExecFileSync>));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: (...args: unknown[]) => mockExecSync(...args),
    execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
  };
});

// Import after mock setup
const { isExpired, readCredentials, writeCredentials, getAccessToken } = await import("@src/auth.js");

describe("auth", () => {
  describe("isExpired", () => {
    it("returns true for expired credentials", () => {
      expect(
        isExpired({
          accessToken: "test",
          refreshToken: "test",
          expiresAt: Date.now() - 1000,
        }),
      ).toBe(true);
    });

    it("returns false for valid credentials", () => {
      expect(
        isExpired({
          accessToken: "test",
          refreshToken: "test",
          expiresAt: Date.now() + 60_000,
        }),
      ).toBe(false);
    });

    it("returns true for edge case at exact expiry", () => {
      const now = Date.now();
      expect(
        isExpired({
          accessToken: "test",
          refreshToken: "test",
          expiresAt: now,
        }),
      ).toBe(true);
    });
  });

  describe("readCredentials from file", () => {
    let tmpDir: string;
    const originalHome = process.env.HOME;
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-auth-"));
      process.env.HOME = tmpDir;
      // Reset mocks to pass-through
      mockExecSync.mockImplementation((...args: unknown[]) => realExecSync(...args as Parameters<typeof realExecSync>));
      mockExecFileSync.mockImplementation((...args: unknown[]) => realExecFileSync(...args as Parameters<typeof realExecFileSync>));
    });

    afterEach(() => {
      process.env.HOME = originalHome;
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    });

    it("reads credentials from file", () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "sk-ant-oat01-test",
            refreshToken: "sk-ant-ort01-test",
            expiresAt: Date.now() + 60_000,
          },
        }),
      );

      // Force non-darwin to skip keychain
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });

      const cred = readCredentials();
      expect(cred).not.toBeNull();
      expect(cred!.accessToken).toBe("sk-ant-oat01-test");
      expect(cred!.refreshToken).toBe("sk-ant-ort01-test");
    });

    it("returns null when no credentials file", () => {
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      expect(readCredentials()).toBeNull();
    });

    it("returns null for malformed credentials", () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: "" } }),
      );
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      expect(readCredentials()).toBeNull();
    });

    it("returns null when expiresAt is invalid", () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "token",
            refreshToken: "refresh",
            expiresAt: "not-a-number",
          },
        }),
      );
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      expect(readCredentials()).toBeNull();
    });
  });

  describe("readCredentials from keychain (darwin)", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    const originalHome = process.env.HOME;
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-auth-kc-"));
      process.env.HOME = tmpDir;
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
      mockExecSync.mockReset();
      mockExecFileSync.mockReset();
    });

    afterEach(() => {
      process.env.HOME = originalHome;
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    });

    it("reads credentials from macOS keychain", () => {
      const keychainData = JSON.stringify({
        claudeAiOauth: {
          accessToken: "keychain-token",
          refreshToken: "keychain-refresh",
          expiresAt: Date.now() + 60_000,
        },
      });
      mockExecSync.mockReturnValueOnce(keychainData);

      const cred = readCredentials();
      expect(cred).not.toBeNull();
      expect(cred!.accessToken).toBe("keychain-token");
      expect(cred!.refreshToken).toBe("keychain-refresh");
    });

    it("falls back to file when keychain throws", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("security: SecKeychainSearchCopyNext failed");
      });

      // Set up file-based credentials as fallback
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "file-token",
            refreshToken: "file-refresh",
            expiresAt: Date.now() + 60_000,
          },
        }),
      );

      const cred = readCredentials();
      expect(cred).not.toBeNull();
      expect(cred!.accessToken).toBe("file-token");
    });

    it("returns null when keychain returns invalid JSON", () => {
      mockExecSync.mockReturnValueOnce("not json");

      const cred = readCredentials();
      // keychain parse fails (catch returns null), file also not found => null
      expect(cred).toBeNull();
    });

    it("returns null when keychain returns data without claudeAiOauth", () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ other: "data" }));

      const cred = readCredentials();
      expect(cred).toBeNull();
    });
  });

  describe("writeCredentials to keychain (darwin)", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    const originalHome = process.env.HOME;
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-auth-wkc-"));
      process.env.HOME = tmpDir;
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
      mockExecSync.mockReset();
      mockExecFileSync.mockReset();
    });

    afterEach(() => {
      process.env.HOME = originalHome;
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    });

    it("writes credentials to macOS keychain", () => {
      const existingData = JSON.stringify({
        claudeAiOauth: {
          accessToken: "old-token",
          refreshToken: "old-refresh",
          expiresAt: 1000,
        },
        otherField: "preserved",
      });
      mockExecSync.mockReturnValueOnce(existingData);
      mockExecFileSync.mockReturnValueOnce(Buffer.from(""));

      const ok = writeCredentials({
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: 9999,
      });
      expect(ok).toBe(true);

      expect(mockExecFileSync).toHaveBeenCalledWith(
        "security",
        expect.arrayContaining(["add-generic-password", "-U"]),
        expect.any(Object),
      );
    });

    it("returns false when keychain read fails during write and no file", () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("keychain locked");
      });

      const ok = writeCredentials({
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: 9999,
      });
      expect(ok).toBe(false);
    });

    it("falls back to file when keychain write fails", () => {
      const existingData = JSON.stringify({
        claudeAiOauth: { accessToken: "old", refreshToken: "old", expiresAt: 1 },
      });
      mockExecSync.mockReturnValueOnce(existingData);
      mockExecFileSync.mockImplementationOnce(() => {
        throw new Error("keychain write failed");
      });

      // Set up file fallback
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: "old", refreshToken: "old", expiresAt: 1 } }),
      );

      const ok = writeCredentials({
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: 9999,
      });
      expect(ok).toBe(true);

      const raw = JSON.parse(fs.readFileSync(path.join(claudeDir, ".credentials.json"), "utf8"));
      expect(raw.claudeAiOauth.accessToken).toBe("new-token");
    });
  });

  describe("writeCredentials to file", () => {
    let tmpDir: string;
    const originalHome = process.env.HOME;
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-auth-w-"));
      process.env.HOME = tmpDir;
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      mockExecSync.mockImplementation((...args: unknown[]) => realExecSync(...args as Parameters<typeof realExecSync>));
      mockExecFileSync.mockImplementation((...args: unknown[]) => realExecFileSync(...args as Parameters<typeof realExecFileSync>));
    });

    afterEach(() => {
      process.env.HOME = originalHome;
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    });

    it("writes credentials back to file", () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "old-token",
            refreshToken: "old-refresh",
            expiresAt: 1000,
          },
          otherField: "preserved",
        }),
      );

      const ok = writeCredentials({
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: 9999,
      });
      expect(ok).toBe(true);

      const raw = JSON.parse(fs.readFileSync(path.join(claudeDir, ".credentials.json"), "utf8"));
      expect(raw.claudeAiOauth.accessToken).toBe("new-token");
      expect(raw.claudeAiOauth.refreshToken).toBe("new-refresh");
      expect(raw.claudeAiOauth.expiresAt).toBe(9999);
      expect(raw.otherField).toBe("preserved");
    });

    it("returns false when no credentials file exists", () => {
      expect(
        writeCredentials({
          accessToken: "token",
          refreshToken: "refresh",
          expiresAt: 1000,
        }),
      ).toBe(false);
    });
  });

  describe("getAccessToken", () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    const originalHome = process.env.HOME;
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-auth-gat-"));
      process.env.HOME = tmpDir;
      Object.defineProperty(process, "platform", { value: "linux", configurable: true });
      mockExecSync.mockImplementation((...args: unknown[]) => realExecSync(...args as Parameters<typeof realExecSync>));
    });

    afterEach(() => {
      process.env.HOME = originalHome;
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    });

    it("returns access token when credentials are valid", async () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "valid-token",
            refreshToken: "refresh-token",
            expiresAt: Date.now() + 60_000,
          },
        }),
      );

      const token = await getAccessToken();
      expect(token).toBe("valid-token");
    });

    it("throws when no credentials found", async () => {
      await expect(getAccessToken()).rejects.toThrow("No Claude CLI credentials found");
    });

    it("throws when token is expired", async () => {
      const claudeDir = path.join(tmpDir, ".claude");
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(claudeDir, ".credentials.json"),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "expired-token",
            refreshToken: "refresh-token",
            expiresAt: Date.now() - 60_000,
          },
        }),
      );

      await expect(getAccessToken()).rejects.toThrow("Claude CLI OAuth token expired");
    });
  });
});
