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

describe.skipIf(!hasCredentials)("e2e: story coherence across channels", () => {
  const config = loadConfig();
  const userId = "story-test";

  beforeAll(() => {
    // Clear conversation history so test is isolated
    const historyFile = path.join(getActivePersonaHome(), "conversations", `${userId}.json`);
    try { fs.unlinkSync(historyFile); } catch { /* doesn't exist yet */ }
  });

  it(
    "recalls a 6-part story told across 3 channels",
    async () => {
      const chapters: Array<{ channel: "telegram" | "email" | "api"; text: string }> = [
        { channel: "telegram", text: "Chapter 1: A detective named Rosa found a locked briefcase at the train station." },
        { channel: "email",    text: "Chapter 2: Inside the briefcase was a map of an abandoned lighthouse on Cray Island." },
        { channel: "api",      text: "Chapter 3: Rosa sailed to Cray Island and found the lighthouse door open." },
        { channel: "telegram", text: "Chapter 4: In the lighthouse she discovered a radio still transmitting a coded message." },
        { channel: "email",    text: "Chapter 5: She decoded the message — it read 'The painting is under the seventh step.'" },
        { channel: "api",      text: "Chapter 6: Rosa returned to the train station, found the seventh step, and recovered a stolen Vermeer painting." },
      ];

      // Tell the story across channels
      for (const ch of chapters) {
        const result = await runAgent(
          [{ role: "user", content: ch.text }],
          config,
          { channel: ch.channel, userId },
        );
        console.log(`[${ch.channel}]`, result.text.slice(0, 100));
        expect(result.text).toBeTruthy();
      }

      // Ask for retelling from email channel
      const retell = await runAgent(
        [{ role: "user", content: "Retell the complete story from beginning to end." }],
        config,
        { channel: "email", userId },
      );
      console.log("[retell]", retell.text);

      // Assert all key story elements are present
      const response = retell.text.toLowerCase();
      expect(response).toContain("rosa");
      expect(response).toContain("briefcase");
      expect(response).toContain("lighthouse");
      expect(response).toMatch(/cray\s*island/i);
      expect(response).toMatch(/coded?\s*message/i);
      expect(response).toMatch(/seventh\s*step/i);
      expect(response).toMatch(/vermeer/i);
    },
    180_000,
  );
});
