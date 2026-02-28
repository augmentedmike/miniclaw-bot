import fs from "node:fs";
import path from "node:path";
import { getMinicawHome, getUserDir } from "./config.js";
import type { Persona, MinicawConfig } from "./types.js";

/**
 * Parse markdown content into a Persona object.
 * Extracts H2 sections case-insensitively. Content before the first H2
 * is captured under the "__preamble" key.
 */
export function parsePersona(name: string, content: string): Persona {
  const sections: Record<string, string> = {};
  const lines = content.split("\n");

  let currentKey = "__preamble";
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      const text = currentLines.join("\n").trim();
      if (text) sections[currentKey] = text;
      currentKey = h2Match[1]!.trim().toLowerCase();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  const text = currentLines.join("\n").trim();
  if (text) sections[currentKey] = text;

  return { name, sections, raw: content };
}

/**
 * Serialize a Persona back to markdown.
 */
export function formatPersona(persona: Persona): string {
  const parts: string[] = [];

  if (persona.sections["__preamble"]) {
    parts.push(persona.sections["__preamble"]);
  }

  for (const [key, value] of Object.entries(persona.sections)) {
    if (key === "__preamble") continue;
    parts.push(`## ${key.charAt(0).toUpperCase() + key.slice(1)}\n\n${value}`);
  }

  return parts.join("\n\n") + "\n";
}

/**
 * Build the system prompt fragment from a persona.
 * Uses raw content directly — soul.md and ethics.md are written in
 * first person with real voice. Don't over-process them.
 */
export function buildPersonaPrompt(persona: Persona): string {
  return persona.raw.trim();
}

/**
 * Load a named persona from user/personas/{name}/persona.md
 */
export function loadPersona(name: string): Persona | null {
  const personaPath = path.join(getUserDir(), "personas", name, "persona.md");
  try {
    const content = fs.readFileSync(personaPath, "utf8");
    return parsePersona(name, content);
  } catch {
    return null;
  }
}

/**
 * Save a persona to user/personas/{name}/persona.md
 */
export function savePersona(persona: Persona): void {
  const dir = path.join(getUserDir(), "personas", persona.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "persona.md"), formatPersona(persona), "utf8");
}

/**
 * List all persona names in user/personas/
 */
export function listPersonas(): string[] {
  const personasDir = path.join(getUserDir(), "personas");
  try {
    return fs.readdirSync(personasDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => {
        return fs.existsSync(path.join(personasDir, d.name, "persona.md"));
      })
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Load the active persona. Resolution order:
 * 1. config.activePersona → load from user/personas/{name}/persona.md
 * 2. Legacy fallback → soul.md + ethics.md in $MINICLAW_HOME root
 * 3. null (no persona)
 *
 * The legacy fallback is critical: AugmentedMike's existing soul.md
 * must just work without migration.
 */
export function loadActivePersona(config: MinicawConfig): Persona | null {
  // 1. Named persona from config
  if (config.activePersona) {
    const persona = loadPersona(config.activePersona);
    if (persona) return persona;
    console.error(`[persona] configured persona "${config.activePersona}" not found, trying legacy fallback`);
  }

  // 2. Legacy fallback: soul.md + ethics.md in MINICLAW_HOME root
  //    This is where AugmentedMike's files live today.
  const home = getMinicawHome();
  const soulPath = path.join(home, "soul.md");
  const ethicsPath = path.join(home, "ethics.md");

  let soulContent = "";
  let ethicsContent = "";

  try { soulContent = fs.readFileSync(soulPath, "utf8"); } catch { /* no soul.md */ }
  try { ethicsContent = fs.readFileSync(ethicsPath, "utf8"); } catch { /* no ethics.md */ }

  if (!soulContent && !ethicsContent) return null;

  const parts = [soulContent, ethicsContent].filter(Boolean);
  const combined = parts.join("\n\n---\n\n");

  // Derive name from the H1 in soul.md, or "legacy"
  const h1Match = soulContent.match(/^#\s+(.+)$/m);
  const name = h1Match ? h1Match[1]!.trim().toLowerCase().replace(/\s+/g, "-") : "legacy";

  return parsePersona(name, combined);
}
