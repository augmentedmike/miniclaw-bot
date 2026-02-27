import fs from "node:fs";
import path from "node:path";
import { getMinicawHome } from "../config.js";

function memoryDir(): string {
  return path.join(getMinicawHome(), "memory");
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
 * Save content to a memory file under ~/.miniclaw/memory/{topic}.md
 */
export function saveMemory(topic: string, content: string): string {
  const dir = memoryDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${sanitizeTopic(topic)}.md`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, `# ${topic}\n\n${content}\n`);
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
