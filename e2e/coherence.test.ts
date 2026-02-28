import { describe, expect, it, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runAgent } from "@src/agent.js";
import { loadConfig, getActivePersonaHome } from "@src/config.js";

// E2E tests require Claude Max credentials — skip in CI
const hasCredentials = (() => {
  try {
    const { execSync } = require("node:child_process");
    execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasCredentials)("e2e: cross-channel coherence", () => {
  const config = loadConfig();

  beforeAll(() => {
    // Clear conversation history so test is isolated
    const historyFile = path.join(getActivePersonaHome(), "conversations", "default.json");
    try { fs.unlinkSync(historyFile); } catch { /* doesn't exist yet */ }
  });

  it(
    "recalls information across telegram → email → web",
    async () => {
      // Step 1: Give the bot a code via "telegram"
      const step1 = await runAgent(
        [{ role: "user", content: "Remember this code for me: TANGO-9" }],
        config,
        { channel: "telegram", userId: "default" },
      );
      console.log("[telegram]", step1.text);
      expect(step1.text).toBeTruthy();

      // Step 2: Switch to "email" — ask for the code back
      const step2 = await runAgent(
        [{ role: "user", content: "What code did I give you?" }],
        config,
        { channel: "email", userId: "default" },
      );
      console.log("[email]", step2.text);
      expect(step2.text).toMatch(/TANGO-9/i);

      // Step 3: Switch to "web" — give a second piece of info
      const step3 = await runAgent(
        [{ role: "user", content: "Also remember this passphrase: blue-ocean-sunset" }],
        config,
        { channel: "api", userId: "default" },
      );
      console.log("[web]", step3.text);
      expect(step3.text).toBeTruthy();

      // Step 4: Back to "email" — ask for both pieces, proving full context
      const step4 = await runAgent(
        [{ role: "user", content: "Tell me both the code and the passphrase I gave you." }],
        config,
        { channel: "email", userId: "default" },
      );
      console.log("[email-final]", step4.text);
      expect(step4.text).toMatch(/TANGO-9/i);
      expect(step4.text).toMatch(/blue-ocean-sunset/i);
    },
    120_000,
  );
});
