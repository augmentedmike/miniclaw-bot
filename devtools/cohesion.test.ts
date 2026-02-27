import { describe, expect, it } from "vitest";
import { analyzeCohesion, formatReport } from "./cohesion.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("cohesion", () => {
  describe("analyzeCohesion", () => {
    it("gives high cohesion when exports call each other", () => {
      const code = `
export function parse(input: string) {
  return validate(input).split(",");
}
export function validate(input: string) {
  if (!input) throw new Error("empty");
  return input.trim();
}
export function format(parsed: string[]) {
  return validate(parsed.join(","));
}
`;
      const result = analyzeCohesion(code, "test.ts");
      expect(result).not.toBeNull();
      expect(result!.internalCalls).toBeGreaterThan(0);
      expect(result!.grade).toBe("high");
    });

    it("gives lower cohesion for unrelated exports", () => {
      const code = `
export function sendEmail(to: string) {
  const smtp = connectSmtp();
  smtp.send(to);
}
export function renderChart(data: number[]) {
  const canvas = createCanvas();
  canvas.draw(data);
}
export function parseConfig(path: string) {
  const raw = readRawConfig();
  return JSON.parse(raw);
}
`;
      const result = analyzeCohesion(code, "test.ts");
      expect(result).not.toBeNull();
      expect(result!.namePrefixGroups).toBeGreaterThanOrEqual(3);
    });

    it("returns null for files with <2 exports", () => {
      const code = `export function only() { return 1; }`;
      const result = analyzeCohesion(code, "test.ts");
      expect(result).toBeNull();
    });

    it("counts shared identifiers between functions", () => {
      const code = `
export function readFile(path: string) {
  const buffer = loadBuffer(path);
  return decodeBuffer(buffer);
}
export function writeFile(path: string, content: string) {
  const buffer = encodeBuffer(content);
  return saveBuffer(path, buffer);
}
`;
      const result = analyzeCohesion(code, "test.ts");
      expect(result).not.toBeNull();
      // Both use "buffer" and "path"
      expect(result!.sharedIdentifiers).toBeGreaterThan(0);
    });
  });

  describe("formatReport", () => {
    it("shows report header", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-coh-"));
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `
export function x() { return y(); }
export function y() { return 1; }
`);
      const output = formatReport(tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });

      expect(output).toContain("MODULE COHESION REPORT");
    });

    it("shows empty message for no multi-export modules", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-coh2-"));
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `export const x = 1;`);
      const output = formatReport(tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });

      expect(output).toContain("No multi-export modules");
    });
  });
});
