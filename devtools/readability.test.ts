import { describe, expect, it } from "vitest";
import { analyzeReadability, formatReport } from "./readability.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("readability", () => {
  describe("analyzeReadability", () => {
    it("gives high score to clean short code", () => {
      const code = `
// Helper to add numbers
export function add(a: number, b: number): number {
  return a + b;
}
`;
      const result = analyzeReadability(code, "clean.ts");
      expect(result.grade).toBe("A");
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it("penalizes long average line length", () => {
      const longLine = "const x = " + "a".repeat(120) + ";";
      const code = Array(20).fill(longLine).join("\n");
      const result = analyzeReadability(code, "long.ts");
      expect(result.avgLineLength).toBeGreaterThan(100);
      expect(result.score).toBeLessThan(90);
    });

    it("detects comment density", () => {
      const code = `
// This is a comment
// Another comment
// One more
const x = 1;
const y = 2;
`;
      const result = analyzeReadability(code, "commented.ts");
      expect(result.commentDensity).toBeGreaterThan(0.3);
    });

    it("detects naming inconsistency", () => {
      const code = `
const camelCase = 1;
const another_snake = 2;
const mixed_case = 3;
const yetAnother = 4;
`;
      const result = analyzeReadability(code, "mixed.ts");
      expect(result.namingConsistency).toBeLessThan(1);
    });

    it("detects magic numbers", () => {
      const code = `
const timeout = 30000;
const maxRetries = 500;
const bufferSize = 8192;
`;
      const result = analyzeReadability(code, "magic.ts");
      expect(result.magicNumbers).toBeGreaterThan(0);
    });

    it("detects deep nesting", () => {
      const code = `
function deep() {
  if (true) {
    for (let i = 0; i < 10; i++) {
      if (i > 5) {
        while (true) {
          if (true) {
            switch (i) {
              case 1: break;
            }
          }
        }
      }
    }
  }
}
`;
      const result = analyzeReadability(code, "nested.ts");
      expect(result.maxNesting).toBeGreaterThanOrEqual(6);
    });

    it("handles empty files", () => {
      const result = analyzeReadability("", "empty.ts");
      expect(result.lines).toBe(1);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe("formatReport", () => {
    it("shows report with file scores", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-read-"));
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `export const x = 1;`);
      fs.writeFileSync(path.join(tmpDir, "b.ts"), `export const y = 2;\n// comment\n`);

      const output = formatReport(tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });

      expect(output).toContain("READABILITY REPORT");
      expect(output).toContain("Average readability score:");
      expect(output).toContain("Grades:");
    });
  });
});
