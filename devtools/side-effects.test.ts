import { describe, expect, it } from "vitest";
import { analyzePurity, formatReport } from "./side-effects.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("side-effects", () => {
  describe("analyzePurity", () => {
    it("marks pure functions as pure", () => {
      const code = `
export function add(a: number, b: number): number {
  return a + b;
}
`;
      const results = analyzePurity(code, "test.ts");
      const fn = results.find((r) => r.name === "add");
      expect(fn).toBeDefined();
      expect(fn!.pure).toBe(true);
      expect(fn!.effects).toHaveLength(0);
    });

    it("detects fs side effects", () => {
      const code = `
export function readConfig() {
  const data = fs.readFileSync("config.json", "utf8");
  return JSON.parse(data);
}
`;
      const results = analyzePurity(code, "test.ts");
      const fn = results.find((r) => r.name === "readConfig");
      expect(fn).toBeDefined();
      expect(fn!.pure).toBe(false);
      expect(fn!.effects).toContain("fs");
    });

    it("detects network side effects", () => {
      const code = `
export async function getData() {
  const res = await fetch("https://api.example.com");
  return res.json();
}
`;
      const results = analyzePurity(code, "test.ts");
      const fn = results.find((r) => r.name === "getData");
      expect(fn).toBeDefined();
      expect(fn!.effects).toContain("network");
    });

    it("detects console side effects", () => {
      const code = `
export function debug(msg: string) {
  console.log(msg);
}
`;
      const results = analyzePurity(code, "test.ts");
      const fn = results.find((r) => r.name === "debug");
      expect(fn!.effects).toContain("console");
    });

    it("detects child_process side effects", () => {
      const code = `
export function run() {
  const proc = spawn("ls", ["-la"]);
  return proc;
}
`;
      const results = analyzePurity(code, "test.ts");
      const fn = results.find((r) => r.name === "run");
      expect(fn!.effects).toContain("child_process");
    });

    it("detects environment access", () => {
      const code = `
export function getKey() {
  return process.env.API_KEY;
}
`;
      const results = analyzePurity(code, "test.ts");
      const fn = results.find((r) => r.name === "getKey");
      expect(fn!.effects).toContain("env");
    });

    it("detects multiple effects in one function", () => {
      const code = `
export function doEverything() {
  console.log("start");
  const data = fs.readFileSync("file.txt", "utf8");
  const result = Math.random();
  return data + result;
}
`;
      const results = analyzePurity(code, "test.ts");
      const fn = results.find((r) => r.name === "doEverything");
      expect(fn!.effects.length).toBeGreaterThanOrEqual(3);
    });

    it("handles arrow functions", () => {
      const code = `
export const transform = (x: number) => {
  return x * 2;
};
`;
      const results = analyzePurity(code, "test.ts");
      const fn = results.find((r) => r.name === "transform");
      expect(fn).toBeDefined();
      expect(fn!.pure).toBe(true);
    });
  });

  describe("formatReport", () => {
    it("shows report header and summary", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-se-"));
      fs.writeFileSync(path.join(tmpDir, "a.ts"), `
export function pure(x: number) { return x + 1; }
export function impure() { console.log("hi"); }
`);
      const output = formatReport(tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });

      expect(output).toContain("SIDE-EFFECT TRACE");
      expect(output).toContain("PURE FUNCTIONS");
      expect(output).toContain("IMPURE FUNCTIONS");
      expect(output).toContain("Total:");
    });
  });
});
