import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildCouplingMatrix, formatReport } from "./coupling.js";

describe("coupling", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-coupling-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("buildCouplingMatrix", () => {
    it("builds matrix from cross-module imports", () => {
      fs.mkdirSync(path.join(tmpDir, "tools"));
      fs.mkdirSync(path.join(tmpDir, "telegram"));
      fs.writeFileSync(path.join(tmpDir, "tools", "a.ts"), `export const x = 1;`);
      fs.writeFileSync(path.join(tmpDir, "telegram", "b.ts"), `import { x } from "../tools/a.js";`);

      const result = buildCouplingMatrix(tmpDir);
      expect(result.modules.length).toBeGreaterThanOrEqual(2);
      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it("detects bidirectional coupling", () => {
      fs.mkdirSync(path.join(tmpDir, "a"));
      fs.mkdirSync(path.join(tmpDir, "b"));
      fs.writeFileSync(path.join(tmpDir, "a", "mod.ts"), `import { y } from "../b/mod.js"; export const x = 1;`);
      fs.writeFileSync(path.join(tmpDir, "b", "mod.ts"), `import { x } from "../a/mod.js"; export const y = 2;`);

      const result = buildCouplingMatrix(tmpDir);
      const pair = result.pairs.find((p) =>
        (p.moduleA === "a" && p.moduleB === "b") || (p.moduleA === "b" && p.moduleB === "a"),
      );
      expect(pair).toBeDefined();
      expect(pair!.aToB).toBeGreaterThan(0);
      expect(pair!.bToA).toBeGreaterThan(0);
    });

    it("ignores same-module imports", () => {
      fs.mkdirSync(path.join(tmpDir, "tools"));
      fs.writeFileSync(path.join(tmpDir, "tools", "a.ts"), `export const x = 1;`);
      fs.writeFileSync(path.join(tmpDir, "tools", "b.ts"), `import { x } from "./a.js";`);

      const result = buildCouplingMatrix(tmpDir);
      // Should have no cross-module pairs
      expect(result.pairs).toHaveLength(0);
    });

    it("returns sorted pairs by coupling score", () => {
      fs.mkdirSync(path.join(tmpDir, "a"));
      fs.mkdirSync(path.join(tmpDir, "b"));
      fs.mkdirSync(path.join(tmpDir, "c"));
      fs.writeFileSync(path.join(tmpDir, "a", "x.ts"), `
import { y } from "../b/y.js";
import { z } from "../b/z.js";
export const x = 1;
`);
      fs.writeFileSync(path.join(tmpDir, "b", "y.ts"), `export const y = 1;`);
      fs.writeFileSync(path.join(tmpDir, "b", "z.ts"), `export const z = 2;`);
      fs.writeFileSync(path.join(tmpDir, "c", "w.ts"), `import { x } from "../a/x.js";`);

      const result = buildCouplingMatrix(tmpDir);
      // a→b has score 2, c→a has score 1
      expect(result.pairs[0]!.score).toBeGreaterThanOrEqual(result.pairs[result.pairs.length - 1]!.score);
    });
  });

  describe("formatReport", () => {
    it("shows report header and matrix", () => {
      fs.mkdirSync(path.join(tmpDir, "tools"));
      fs.writeFileSync(path.join(tmpDir, "agent.ts"), `import { x } from "./tools/a.js";`);
      fs.writeFileSync(path.join(tmpDir, "tools", "a.ts"), `export const x = 1;`);

      const output = formatReport(tmpDir);
      expect(output).toContain("COUPLING MATRIX");
      expect(output).toContain("Total:");
    });

    it("shows empty message when no modules", () => {
      const output = formatReport(tmpDir);
      expect(output).toContain("No modules found");
    });
  });
});
