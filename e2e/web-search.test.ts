import { describe, expect, it } from "vitest";
import { runAgent } from "@src/agent.js";
import { loadConfig } from "@src/config.js";

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

describe.skipIf(!hasCredentials)("e2e: web search", () => {
  it(
    "searches the web for Ireland GDP and returns a result",
    async () => {
      const config = loadConfig();
      const result = await runAgent(
        [
          {
            role: "user",
            content:
              "Search the web for the most recent GDP of Ireland. " +
              "Return just the GDP figure and the year it's from.",
          },
        ],
        config,
      );

      // Should have used web_search tool and returned something about GDP
      expect(result.text).toBeTruthy();
      expect(result.text.toLowerCase()).toMatch(/gdp|billion|trillion|ireland/i);
      console.log("Agent response:", result.text);
    },
    { timeout: 60_000 },
  );
});
