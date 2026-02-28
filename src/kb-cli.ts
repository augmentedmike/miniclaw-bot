/**
 * Knowledge Base CLI — manage the local vector database.
 *
 * Usage:
 *   npx tsx src/kb-cli.ts add <category> <content>     Add an entry
 *   npx tsx src/kb-cli.ts search <query>               Hybrid search
 *   npx tsx src/kb-cli.ts list [category]               List entries
 *   npx tsx src/kb-cli.ts get <id>                      Get entry by ID
 *   npx tsx src/kb-cli.ts remove <id>                   Remove an entry
 *   npx tsx src/kb-cli.ts import-memory                 Import existing memory files
 *   npx tsx src/kb-cli.ts export [file]                 Export KB as JSON
 *   npx tsx src/kb-cli.ts import <file>                 Import KB from JSON
 *   npx tsx src/kb-cli.ts stats                         Show statistics
 *   npx tsx src/kb-cli.ts rebuild-embeddings            Regenerate all vectors
 *
 * Categories: personality, fact, procedure, general
 */

import fs from "node:fs";
import path from "node:path";
import { getActivePersonaHome, ensurePersonaDirs, loadConfig } from "./config.js";
import { KBEngine } from "./kb/engine.js";
import type { KBCategory, KBEntry } from "./kb/types.js";

const CATEGORIES = ["personality", "fact", "procedure", "general"] as const;

function usage(): never {
  console.log(`
Knowledge Base — local vector database

Commands:
  add <category> <content>     Add an entry
  search <query>               Hybrid search (vector + keyword)
  list [category]              List entries
  get <id>                     Get full entry by ID
  remove <id>                  Remove an entry
  import-memory                Import existing memory/ markdown files
  export [file]                Export KB as JSON (default: stdout)
  import <file>                Import KB from JSON file
  stats                        Show statistics
  rebuild-embeddings           Regenerate all vector embeddings

Categories: ${CATEGORIES.join(", ")}
`.trim());
  process.exit(1);
}

function getEngine(): KBEngine {
  const config = loadConfig();
  const personaName = config.activePersona ?? "default";
  ensurePersonaDirs(personaName);
  const personaHome = getActivePersonaHome(config);
  const dbPath = path.join(personaHome, "kb", "vectors.db");
  return new KBEngine(dbPath);
}

async function handleAdd(args: string[]): Promise<void> {
  const [category, ...contentParts] = args;
  const content = contentParts.join(" ");
  if (!category || !content) usage();

  if (!CATEGORIES.includes(category as KBCategory)) {
    console.error(`Invalid category: ${category}. Must be one of: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const engine = getEngine();
  const entry = await engine.add(category as KBCategory, content, { source: "cli" });
  console.log(`Added: ${entry.category}/${entry.id}`);
  console.log(`Content: ${entry.content.slice(0, 100)}${entry.content.length > 100 ? "..." : ""}`);
  engine.close();
}

async function handleSearch(args: string[]): Promise<void> {
  const query = args.join(" ");
  if (!query) usage();

  const engine = getEngine();
  const results = await engine.search(query, { limit: 10 });

  if (results.length === 0) {
    console.log("No results found.");
  } else {
    for (const r of results) {
      const tags = r.entry.tags.length > 0 ? ` [${r.entry.tags.join(", ")}]` : "";
      console.log(`\n${r.entry.category}/${r.entry.id} (score: ${r.score.toFixed(4)}, ${r.method})${tags}`);
      console.log(`  ${r.entry.content}`);
    }
    console.log(`\n${results.length} result(s)`);
  }
  engine.close();
}

function handleList(args: string[]): void {
  const [category] = args;
  if (category && !CATEGORIES.includes(category as KBCategory)) {
    console.error(`Invalid category: ${category}. Must be one of: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const engine = getEngine();
  const entries = engine.list(category as KBCategory | undefined);

  if (entries.length === 0) {
    console.log(category ? `No entries in "${category}".` : "Knowledge base is empty.");
  } else {
    for (const e of entries) {
      const preview = e.content.length > 80 ? e.content.slice(0, 80) + "..." : e.content;
      console.log(`${e.category}/${e.id}: ${preview}`);
    }
    console.log(`\n${entries.length} entry/entries`);
  }
  engine.close();
}

function handleGet(args: string[]): void {
  const [id] = args;
  if (!id) usage();

  const engine = getEngine();
  const entry = engine.get(id);

  if (!entry) {
    console.error(`Not found: ${id}`);
    process.exit(1);
  }

  console.log(`ID:       ${entry.id}`);
  console.log(`Category: ${entry.category}`);
  console.log(`Source:   ${entry.source || "(none)"}`);
  console.log(`Tags:     ${entry.tags.length > 0 ? entry.tags.join(", ") : "(none)"}`);
  console.log(`Created:  ${entry.createdAt}`);
  console.log(`Updated:  ${entry.updatedAt}`);
  if (Object.keys(entry.metadata).length > 0) {
    console.log(`Metadata: ${JSON.stringify(entry.metadata)}`);
  }
  console.log(`\n${entry.content}`);
  engine.close();
}

function handleRemove(args: string[]): void {
  const [id] = args;
  if (!id) usage();

  const engine = getEngine();
  const removed = engine.remove(id);

  if (removed) {
    console.log(`Removed: ${id}`);
  } else {
    console.error(`Not found: ${id}`);
    process.exit(1);
  }
  engine.close();
}

async function handleImportMemory(): Promise<void> {
  const config = loadConfig();
  const personaHome = getActivePersonaHome(config);
  const memoryDir = path.join(personaHome, "memory");

  if (!fs.existsSync(memoryDir)) {
    console.log("No memory directory found. Nothing to import.");
    return;
  }

  const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    console.log("No markdown files found in memory/.");
    return;
  }

  const engine = getEngine();
  let imported = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(memoryDir, file), "utf8");
    const topic = file.replace(/\.md$/, "");

    // Split by H2 headings — each section becomes a separate entry
    const sections = content.split(/^## /m).filter(Boolean);

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed || trimmed.startsWith("# ") && sections.length === 1) {
        // Skip auto-generated header if it's the only "section"
        continue;
      }

      // Determine category from topic name
      let category: KBCategory = "general";
      if (topic.startsWith("conversation")) category = "general";
      else if (topic.includes("procedure") || topic.includes("workflow")) category = "procedure";
      else if (topic.includes("personality") || topic.includes("identity")) category = "personality";
      else category = "fact";

      const body = trimmed.replace(/^.+\n/, "").trim() || trimmed; // Remove first line (heading) if multiline
      if (body.length < 5) continue; // Skip trivially short entries

      await engine.add(category, body, {
        source: `memory/${file}`,
        tags: [topic],
      });
      imported++;
    }
  }

  console.log(`Imported ${imported} entries from ${files.length} memory file(s).`);
  engine.close();
}

function handleExport(args: string[]): void {
  const [file] = args;
  const engine = getEngine();
  const entries = engine.list();

  const json = JSON.stringify(entries, null, 2);

  if (file) {
    fs.writeFileSync(file, json, "utf8");
    console.log(`Exported ${entries.length} entries to ${file}`);
  } else {
    process.stdout.write(json + "\n");
  }
  engine.close();
}

async function handleImport(args: string[]): Promise<void> {
  const [file] = args;
  if (!file) usage();

  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(file, "utf8");
  const entries = JSON.parse(raw) as KBEntry[];

  const engine = getEngine();
  let imported = 0;

  for (const entry of entries) {
    await engine.add(entry.category, entry.content, {
      metadata: entry.metadata,
      tags: entry.tags,
      source: entry.source || `import:${path.basename(file)}`,
    });
    imported++;
  }

  console.log(`Imported ${imported} entries from ${file}`);
  engine.close();
}

function handleStats(): void {
  const engine = getEngine();
  const s = engine.stats();

  console.log(`Knowledge Base Statistics`);
  console.log(`  Total entries: ${s.total}`);
  console.log(`  By category:`);
  for (const [cat, count] of Object.entries(s.byCategory)) {
    console.log(`    ${cat}: ${count}`);
  }
  console.log(`  Database size: ${(s.dbSizeBytes / 1024).toFixed(1)} KB`);
  console.log(`  DB path: ${engine.dbPath}`);
  engine.close();
}

async function handleRebuildEmbeddings(): Promise<void> {
  const engine = getEngine();
  console.log("Rebuilding embeddings...");
  const count = await engine.rebuildEmbeddings();
  console.log(`Rebuilt ${count} embeddings.`);
  engine.close();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command) usage();

  switch (command) {
    case "add":                await handleAdd(args); break;
    case "search":             await handleSearch(args); break;
    case "list":               handleList(args); break;
    case "get":                handleGet(args); break;
    case "remove":             handleRemove(args); break;
    case "import-memory":      await handleImportMemory(); break;
    case "export":             handleExport(args); break;
    case "import":             await handleImport(args); break;
    case "stats":              handleStats(); break;
    case "rebuild-embeddings": await handleRebuildEmbeddings(); break;
    default:                   usage();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
