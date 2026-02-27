import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkSolid, formatReport } from "./solid-check.js";

describe("solid-check", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-solid-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("checkSolid", () => {
    it("flags SRP violation for too many exports", () => {
      const exports = Array.from({ length: 12 }, (_, i) => `export function fn${i}() {}`).join("\n");
      fs.writeFileSync(path.join(tmpDir, "bloated.ts"), exports);
      const violations = checkSolid(tmpDir);
      const srp = violations.filter((v) => v.principle === "SRP" && v.file === "bloated.ts");
      expect(srp.length).toBeGreaterThan(0);
      expect(srp.some((v) => v.severity === "error")).toBe(true);
    });

    it("warns for moderate export count (7-10)", () => {
      const exports = Array.from({ length: 8 }, (_, i) => `export function fn${i}() {}`).join("\n");
      fs.writeFileSync(path.join(tmpDir, "moderate.ts"), exports);
      const violations = checkSolid(tmpDir);
      const srp = violations.filter((v) => v.principle === "SRP" && v.file === "moderate.ts");
      expect(srp.some((v) => v.severity === "warn")).toBe(true);
    });

    it("flags SRP for very long files", () => {
      const content = Array.from({ length: 350 }, (_, i) => `const x${i} = ${i};`).join("\n");
      fs.writeFileSync(path.join(tmpDir, "long.ts"), content);
      const violations = checkSolid(tmpDir);
      const srp = violations.filter((v) => v.principle === "SRP" && v.message.includes("lines"));
      expect(srp.length).toBeGreaterThan(0);
    });

    it("flags OCP for many switch/if-else chains", () => {
      const content = `
export function dispatch(action: string) {
  switch (action) { case "a": break; }
  switch (action) { case "b": break; }
  switch (action) { case "c": break; }
  if (action === "d") {} else if (action === "e") {}
  else if (action === "f") {} else if (action === "g") {}
}
`;
      fs.writeFileSync(path.join(tmpDir, "switchy.ts"), content);
      const violations = checkSolid(tmpDir);
      const ocp = violations.filter((v) => v.principle === "OCP");
      expect(ocp.length).toBeGreaterThan(0);
    });

    it("flags ISP for importing too many names", () => {
      const content = `import { a, b, c, d, e, f, g, h, i, j } from "./big-module.js";`;
      fs.writeFileSync(path.join(tmpDir, "fat-import.ts"), content);
      const violations = checkSolid(tmpDir);
      const isp = violations.filter((v) => v.principle === "ISP");
      expect(isp.length).toBeGreaterThan(0);
    });

    it("flags DIP for direct fs import in non-infra files", () => {
      // Create a file in a non-infra directory
      fs.mkdirSync(path.join(tmpDir, "core"));
      fs.writeFileSync(path.join(tmpDir, "core", "logic.ts"), `import fs from "node:fs";`);
      const violations = checkSolid(tmpDir);
      const dip = violations.filter((v) => v.principle === "DIP");
      expect(dip.length).toBeGreaterThan(0);
    });

    it("does not flag DIP for fs imports in tool/infra files", () => {
      fs.mkdirSync(path.join(tmpDir, "tools"));
      fs.writeFileSync(path.join(tmpDir, "tools", "files.ts"), `import fs from "node:fs";`);
      const violations = checkSolid(tmpDir);
      const dip = violations.filter((v) => v.principle === "DIP" && v.file.includes("tools"));
      expect(dip).toHaveLength(0);
    });

    it("returns empty for clean code", () => {
      fs.writeFileSync(path.join(tmpDir, "clean.ts"), `export function clean() { return true; }`);
      const violations = checkSolid(tmpDir);
      expect(violations).toHaveLength(0);
    });
  });

  describe("formatReport", () => {
    it("shows report header", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `export const x = 1;`);
      const output = formatReport(tmpDir);
      expect(output).toContain("SOLID CHECK REPORT");
    });

    it("shows clean result for no violations", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `export const x = 1;`);
      const output = formatReport(tmpDir);
      expect(output).toContain("No SOLID violations detected");
    });

    it("shows error and warning counts", () => {
      const exports = Array.from({ length: 12 }, (_, i) => `export function fn${i}() {}`).join("\n");
      fs.writeFileSync(path.join(tmpDir, "bloated.ts"), exports);
      const output = formatReport(tmpDir);
      expect(output).toContain("Total:");
    });
  });
});
