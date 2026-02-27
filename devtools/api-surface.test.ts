import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { mapApiSurface, formatReport } from "./api-surface.js";

describe("api-surface", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-apisurface-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("mapApiSurface", () => {
    it("maps exported functions and their consumers", () => {
      fs.writeFileSync(path.join(tmpDir, "lib.ts"), `
export function helper() {}
export const VALUE = 42;
`);
      fs.writeFileSync(path.join(tmpDir, "consumer.ts"), `
import { helper, VALUE } from "./lib.js";
helper();
`);
      const modules = mapApiSurface(tmpDir);
      const lib = modules.find((m) => m.file === "lib.ts");
      expect(lib).toBeDefined();
      expect(lib!.exports.map((e) => e.name)).toContain("helper");
      expect(lib!.exports.map((e) => e.name)).toContain("VALUE");
      expect(lib!.consumers.has("consumer.ts")).toBe(true);
    });

    it("identifies export kinds correctly", () => {
      fs.writeFileSync(path.join(tmpDir, "types.ts"), `
export function myFunc() {}
export const myConst = 1;
export class MyClass {}
export type MyType = string;
export interface MyInterface {}
export enum MyEnum { A, B }
`);
      const modules = mapApiSurface(tmpDir);
      const mod = modules.find((m) => m.file === "types.ts");
      expect(mod).toBeDefined();
      const kinds = mod!.exports.map((e) => ({ name: e.name, kind: e.kind }));
      expect(kinds).toContainEqual({ name: "myFunc", kind: "function" });
      expect(kinds).toContainEqual({ name: "myConst", kind: "const" });
      expect(kinds).toContainEqual({ name: "MyClass", kind: "class" });
      expect(kinds).toContainEqual({ name: "MyType", kind: "type" });
      expect(kinds).toContainEqual({ name: "MyInterface", kind: "interface" });
      expect(kinds).toContainEqual({ name: "MyEnum", kind: "enum" });
    });

    it("skips files with no exports", () => {
      fs.writeFileSync(path.join(tmpDir, "internal.ts"), `const x = 1;`);
      fs.writeFileSync(path.join(tmpDir, "public.ts"), `export const y = 2;`);
      const modules = mapApiSurface(tmpDir);
      expect(modules.find((m) => m.file === "internal.ts")).toBeUndefined();
      expect(modules.find((m) => m.file === "public.ts")).toBeDefined();
    });

    it("ignores external package imports", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `
import { z } from "zod";
export function validate() {}
`);
      const modules = mapApiSurface(tmpDir);
      const mod = modules.find((m) => m.file === "a.ts");
      expect(mod).toBeDefined();
      expect(mod!.consumers.size).toBe(0);
    });

    it("tracks line numbers for exports", () => {
      fs.writeFileSync(path.join(tmpDir, "lines.ts"), `
// comment line 2
// comment line 3
export function first() {}
// comment line 5
export function second() {}
`);
      const modules = mapApiSurface(tmpDir);
      const mod = modules.find((m) => m.file === "lines.ts");
      expect(mod).toBeDefined();
      const first = mod!.exports.find((e) => e.name === "first");
      const second = mod!.exports.find((e) => e.name === "second");
      expect(first!.line).toBe(4);
      expect(second!.line).toBe(6);
    });
  });

  describe("formatReport", () => {
    it("shows report header", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `export const x = 1;`);
      const output = formatReport(tmpDir);
      expect(output).toContain("API SURFACE MAP");
    });

    it("marks unused exports", () => {
      fs.writeFileSync(path.join(tmpDir, "lib.ts"), `
export function used() {}
export function unused() {}
`);
      fs.writeFileSync(path.join(tmpDir, "consumer.ts"), `
import { used } from "./lib.js";
used();
`);
      const output = formatReport(tmpDir);
      expect(output).toContain("UNUSED");
    });

    it("shows consumer count and stability warning", () => {
      fs.writeFileSync(path.join(tmpDir, "core.ts"), `export function shared() {}`);
      // Create 4 consumers
      for (let i = 0; i < 4; i++) {
        fs.writeFileSync(path.join(tmpDir, `consumer${i}.ts`), `import { shared } from "./core.js";`);
      }
      const output = formatReport(tmpDir);
      expect(output).toContain("STABLE");
      expect(output).toContain("4 consumers");
    });

    it("shows summary totals", () => {
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `export const x = 1;`);
      fs.writeFileSync(path.join(tmpDir, "b.ts"), `export const y = 2;`);
      const output = formatReport(tmpDir);
      expect(output).toContain("Total:");
      expect(output).toContain("modules");
      expect(output).toContain("exports");
    });
  });
});
