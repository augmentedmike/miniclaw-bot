import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { findExports, findImportedNames, detectDeadCode, formatReport } from "./dead-code.js";

describe("dead-code", () => {
  describe("findExports", () => {
    it("finds named exports", () => {
      const content = `
export function foo() {}
export const bar = 1;
export class Baz {}
export type MyType = string;
export interface MyInterface {}
export enum MyEnum {}
`;
      const exports = findExports(content);
      const names = exports.map((e) => e.name);
      expect(names).toContain("foo");
      expect(names).toContain("bar");
      expect(names).toContain("Baz");
      expect(names).toContain("MyType");
      expect(names).toContain("MyInterface");
      expect(names).toContain("MyEnum");
    });

    it("finds default exports", () => {
      const content = `export default function handler() {}`;
      const exports = findExports(content);
      expect(exports.find((e) => e.name === "handler")).toBeDefined();
    });

    it("finds re-exports", () => {
      const content = `export { foo, bar as baz } from "./other.js";`;
      const exports = findExports(content);
      const names = exports.map((e) => e.name);
      expect(names).toContain("foo");
      expect(names).toContain("baz");
    });

    it("tracks line numbers", () => {
      const content = `const x = 1;
export function myFunc() {}`;
      const exports = findExports(content);
      const fn = exports.find((e) => e.name === "myFunc");
      expect(fn).toBeDefined();
      expect(fn!.line).toBe(2);
    });
  });

  describe("findImportedNames", () => {
    it("finds named imports", () => {
      const content = `import { foo, bar } from "./module.js";`;
      const names = findImportedNames(content);
      expect(names.has("foo")).toBe(true);
      expect(names.has("bar")).toBe(true);
    });

    it("finds default imports", () => {
      const content = `import MyClass from "./module.js";`;
      const names = findImportedNames(content);
      expect(names.has("MyClass")).toBe(true);
    });

    it("handles aliased imports", () => {
      const content = `import { foo as bar } from "./module.js";`;
      const names = findImportedNames(content);
      expect(names.has("foo")).toBe(true);
    });
  });

  describe("detectDeadCode", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-deadcode-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("detects unused exports", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `
export function used() {}
export function unused() {}
`);
      fs.writeFileSync(path.join(tmpDir, "b.ts"), `
import { used } from "./a.js";
used();
`);
      const result = detectDeadCode(tmpDir);
      const deadNames = result.deadExports.map((d) => d.name);
      expect(deadNames).toContain("unused");
    });

    it("detects orphan files", () => {
      fs.writeFileSync(path.join(tmpDir, "orphan.ts"), `export function lonely() {}`);
      fs.writeFileSync(path.join(tmpDir, "main.ts"), `const x = 1;`);
      const result = detectDeadCode(tmpDir);
      const orphanFiles = result.orphanFiles.map((o) => o.file);
      expect(orphanFiles).toContain("orphan.ts");
    });

    it("does not flag imported files as orphans", () => {
      fs.writeFileSync(path.join(tmpDir, "lib.ts"), `export const x = 1;`);
      fs.writeFileSync(path.join(tmpDir, "main.ts"), `import { x } from "./lib.js";`);
      const result = detectDeadCode(tmpDir);
      const orphanFiles = result.orphanFiles.map((o) => o.file);
      expect(orphanFiles).not.toContain("lib.ts");
    });
  });

  describe("formatReport", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-deadcode-fmt-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("shows report header", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `export const x = 1;`);
      const output = formatReport(tmpDir);
      expect(output).toContain("DEAD CODE REPORT");
    });

    it("shows clean report when no dead code", () => {
      fs.writeFileSync(path.join(tmpDir, "index.ts"), `
import { Helper } from "./helper.js";
`);
      fs.writeFileSync(path.join(tmpDir, "helper.ts"), `export class Helper {}`);
      const output = formatReport(tmpDir);
      expect(output).toContain("No orphan files");
    });
  });
});
