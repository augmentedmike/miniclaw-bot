import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@src/system-prompt.js";

describe("buildSystemPrompt", () => {
  it("includes runtime info", () => {
    const prompt = buildSystemPrompt(["shell_exec", "read_file"]);
    expect(prompt).toContain("Host:");
    expect(prompt).toContain("Current time:");
    expect(prompt).toContain("Shell:");
  });

  it("lists available tools", () => {
    const prompt = buildSystemPrompt(["shell_exec", "read_file", "memory_save"]);
    expect(prompt).toContain("shell_exec");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("memory_save");
  });

  it("handles empty tool list", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain("no tools available");
  });

  it("includes agent guidelines", () => {
    const prompt = buildSystemPrompt(["shell_exec"]);
    expect(prompt).toContain("Be direct and concise");
    expect(prompt).toContain("system access");
  });
});
