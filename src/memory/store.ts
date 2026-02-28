import fs from "node:fs";
import path from "node:path";
import { getActivePersonaHome } from "../config.js";
import { ensureQmdCollection, indexMemory } from "./search.js";

function memoryDir(): string {
  return path.join(getActivePersonaHome(), "memory");
}

function sanitizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled";
}

/**
 * Save content to a memory file under $MINICLAW_HOME/memory/{topic}.md
 * and re-index with qmd if available.
 */
export function saveMemory(topic: string, content: string): string {
  const dir = memoryDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${sanitizeTopic(topic)}.md`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, `# ${topic}\n\n${content}\n`);

  // Index the new/updated file with qmd
  ensureQmdCollection();
  indexMemory();

  return filePath;
}

/**
 * Read a specific memory file.
 */
export function readMemory(topic: string): string | null {
  const filename = `${sanitizeTopic(topic)}.md`;
  const filePath = path.join(memoryDir(), filename);
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * List all memory files.
 */
export function listMemories(): string[] {
  const dir = memoryDir();
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}
