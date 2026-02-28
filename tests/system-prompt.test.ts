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
    expect(prompt).toContain("Talk like a human");
    expect(prompt).toContain("system access");
  });

  it("defaults to cli channel", () => {
    const prompt = buildSystemPrompt(["shell_exec"]);
    expect(prompt).toContain("You are responding via cli");
  });

  it("includes specified channel", () => {
    const prompt = buildSystemPrompt(["shell_exec"], undefined, "telegram");
    expect(prompt).toContain("You are responding via telegram");
  });

  it("shows 'No prior context' when no memory context", () => {
    const prompt = buildSystemPrompt(["shell_exec"]);
    expect(prompt).toContain("No prior context.");
  });

  it("includes memory context when provided", () => {
    const context = "- [prefs] I prefer PostgreSQL";
    const prompt = buildSystemPrompt(["shell_exec"], undefined, "cli", context);
    expect(prompt).toContain("I prefer PostgreSQL");
    expect(prompt).not.toContain("No prior context.");
  });

  it("includes conversation history and memory guidelines", () => {
    const prompt = buildSystemPrompt(["shell_exec"]);
    expect(prompt).toContain("conversation history");
    expect(prompt).toContain("knowledge base");
  });

  it("includes userId when provided", () => {
    const prompt = buildSystemPrompt(["shell_exec"], undefined, "telegram", undefined, "tg-12345");
    expect(prompt).toContain("Talking to: tg-12345");
  });

  it("omits userId line when not provided", () => {
    const prompt = buildSystemPrompt(["shell_exec"]);
    expect(prompt).not.toContain("Talking to:");
  });

  it("includes persona when personaPrompt is provided", () => {
    const personaPrompt = "I am AugmentedMike. Systems all the way down.";
    const prompt = buildSystemPrompt(["shell_exec"], undefined, "cli", undefined, undefined, personaPrompt);
    expect(prompt).toContain("## Persona");
    expect(prompt).toContain("AugmentedMike");
    expect(prompt).toContain("Systems all the way down");
    // Should not have the generic opener when persona is present
    expect(prompt).not.toContain("You are a personal AI agent");
  });

  it("uses generic opener when no personaPrompt", () => {
    const prompt = buildSystemPrompt(["shell_exec"]);
    expect(prompt).toContain("You are a personal AI agent");
    expect(prompt).not.toContain("## Persona");
  });
});
