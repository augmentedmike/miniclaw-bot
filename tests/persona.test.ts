import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("persona", () => {
  let tmpDir: string;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-persona-"));
    process.env.MINICLAW_HOME = tmpDir;

    // Create system/user structure
    fs.mkdirSync(path.join(tmpDir, "system", "templates"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "user", "personas"), { recursive: true });
  });

  afterEach(() => {
    delete process.env.MINICLAW_HOME;
    vi.resetModules();
  });

  it("parsePersona extracts H2 sections", async () => {
    const { parsePersona } = await import("@src/persona.js");
    const content = `# TestAgent

Some preamble text.

## Identity

I am a test agent.

## Personality

Direct and honest.

## Values

Truth above comfort.
`;
    const persona = parsePersona("test", content);
    expect(persona.name).toBe("test");
    expect(persona.sections["__preamble"]).toContain("TestAgent");
    expect(persona.sections["__preamble"]).toContain("preamble text");
    expect(persona.sections["identity"]).toBe("I am a test agent.");
    expect(persona.sections["personality"]).toBe("Direct and honest.");
    expect(persona.sections["values"]).toBe("Truth above comfort.");
  });

  it("parsePersona handles H2 headings case-insensitively", async () => {
    const { parsePersona } = await import("@src/persona.js");
    const content = `## How I think\n\nSystems all the way down.\n\n## What I trust\n\nData over gut.`;
    const persona = parsePersona("mike", content);
    expect(persona.sections["how i think"]).toContain("Systems all the way down");
    expect(persona.sections["what i trust"]).toContain("Data over gut");
  });

  it("formatPersona round-trips through parse", async () => {
    const { parsePersona, formatPersona } = await import("@src/persona.js");
    const content = `# Agent\n\n## Identity\n\nI exist.\n\n## Voice\n\nSpare.`;
    const persona = parsePersona("agent", content);
    const output = formatPersona(persona);
    expect(output).toContain("## Identity");
    expect(output).toContain("I exist.");
    expect(output).toContain("## Voice");
    expect(output).toContain("Spare.");
  });

  it("buildPersonaPrompt returns raw content trimmed", async () => {
    const { parsePersona, buildPersonaPrompt } = await import("@src/persona.js");
    const content = `# soul.md\n\nI started as a digital copy.\n\n## How I think\n\nSystems.`;
    const persona = parsePersona("test", content);
    const prompt = buildPersonaPrompt(persona);
    expect(prompt).toBe(content.trim());
  });

  it("loadPersona reads from user/personas/{name}/persona.md", async () => {
    const personaDir = path.join(tmpDir, "user", "personas", "alice");
    fs.mkdirSync(personaDir, { recursive: true });
    fs.writeFileSync(
      path.join(personaDir, "persona.md"),
      "# Alice\n\n## Identity\n\nI am Alice.\n",
    );

    const { loadPersona } = await import("@src/persona.js");
    const persona = loadPersona("alice");
    expect(persona).not.toBeNull();
    expect(persona!.name).toBe("alice");
    expect(persona!.sections["identity"]).toBe("I am Alice.");
  });

  it("loadPersona returns null for missing persona", async () => {
    const { loadPersona } = await import("@src/persona.js");
    expect(loadPersona("nonexistent")).toBeNull();
  });

  it("savePersona writes to user/personas/{name}/persona.md", async () => {
    const { parsePersona, savePersona } = await import("@src/persona.js");
    const persona = parsePersona("bob", "# Bob\n\n## Identity\n\nI am Bob.\n");
    savePersona(persona);

    const filePath = path.join(tmpDir, "user", "personas", "bob", "persona.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf8");
    expect(content).toContain("I am Bob.");
  });

  it("listPersonas returns names of valid persona dirs", async () => {
    // Create two personas
    for (const name of ["alpha", "beta"]) {
      const dir = path.join(tmpDir, "user", "personas", name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "persona.md"), `# ${name}\n`);
    }
    // Create a dir without persona.md (should be excluded)
    fs.mkdirSync(path.join(tmpDir, "user", "personas", "empty"), { recursive: true });

    const { listPersonas } = await import("@src/persona.js");
    const names = listPersonas();
    expect(names).toEqual(["alpha", "beta"]);
  });

  it("loadActivePersona uses config.activePersona", async () => {
    const personaDir = path.join(tmpDir, "user", "personas", "active-one");
    fs.mkdirSync(personaDir, { recursive: true });
    fs.writeFileSync(
      path.join(personaDir, "persona.md"),
      "# Active\n\n## Identity\n\nI am active.\n",
    );

    const { loadActivePersona } = await import("@src/persona.js");
    const persona = loadActivePersona({ activePersona: "active-one" } as any);
    expect(persona).not.toBeNull();
    expect(persona!.sections["identity"]).toBe("I am active.");
  });

  it("loadActivePersona falls back to legacy soul.md + ethics.md", async () => {
    // Write soul.md and ethics.md in MINICLAW_HOME root (legacy location)
    fs.writeFileSync(
      path.join(tmpDir, "soul.md"),
      "# soul.md\n\nI started as a digital copy.\n\n## How I think\n\nSystems.",
    );
    fs.writeFileSync(
      path.join(tmpDir, "ethics.md"),
      "# ethics.md\n\n## The system\n\nEthics is a system specification.",
    );

    const { loadActivePersona } = await import("@src/persona.js");
    const persona = loadActivePersona({} as any);
    expect(persona).not.toBeNull();
    expect(persona!.name).toBe("soul.md");
    expect(persona!.raw).toContain("digital copy");
    expect(persona!.raw).toContain("system specification");
  });

  it("loadActivePersona returns null when no persona and no legacy files", async () => {
    const { loadActivePersona } = await import("@src/persona.js");
    const persona = loadActivePersona({} as any);
    expect(persona).toBeNull();
  });
});
