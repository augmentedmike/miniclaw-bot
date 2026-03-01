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
import type { KBCategory, KBOrigin, KBVolatility, KBEntry } from "./kb/types.js";
import { videoIngest } from "./kb-video-ingest.js";

const CATEGORIES = ["personality", "fact", "procedure", "general"] as const;
const ORIGINS = ["scholastic", "human", "observed", "read", "inferred", "imported"] as const;
const VOLATILITIES = ["stable", "temporal", "versioned"] as const;

function usage(): never {
  console.log(`
Knowledge Base — local vector database

Commands:
  add <category> <content> [flags]
                               Add an entry
    --origin <origin>          scholastic|human|observed|read|inferred|imported
    --confidence <0-1>         Override default confidence
    --volatility <vol>         stable|temporal|versioned
    --expires <ISO date>       Expiry for temporal entries
    --source <source>          Mechanical provenance (URL, conversation, file)
    --tags <t,t,...>           Comma-separated tags
  search <query> [--origin <o>]  Hybrid search (vector + keyword)
  list [category] [--origin <o>] List entries
  get <id>                     Get full entry by ID
  remove <id>                  Remove an entry
  import-memory                Import existing memory/ markdown files
  export [file]                Export KB as JSON (default: stdout)
  import <file>                Import KB from JSON file
  stats                        Show statistics
  rebuild-embeddings           Regenerate all vector embeddings
  video-ingest <url> [flags]   Transcribe video + capture screenshots into KB
    --interval <secs>          Screenshot every N seconds (default: 60)
    --lang <code>              Subtitle language (default: en)
    --max-frames <n>           Max screenshots to capture (default: 30)
    --tags <t,t,...>           Extra tags
    --dry-run                  Parse and plan without writing to KB

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

function extractFlag(args: string[], flag: string): { value: string | undefined; rest: string[] } {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return { value: undefined, rest: args };
  const value = args[idx + 1]!;
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { value, rest };
}

async function handleAdd(args: string[]): Promise<void> {
  let remaining = args;

  const { value: source, rest: r1 } = extractFlag(remaining, "--source");
  remaining = r1;
  const { value: tagsRaw, rest: r2 } = extractFlag(remaining, "--tags");
  remaining = r2;
  const { value: originRaw, rest: r3 } = extractFlag(remaining, "--origin");
  remaining = r3;
  const { value: confidenceRaw, rest: r4 } = extractFlag(remaining, "--confidence");
  remaining = r4;
  const { value: volatilityRaw, rest: r5 } = extractFlag(remaining, "--volatility");
  remaining = r5;
  const { value: expiresAt, rest: r6 } = extractFlag(remaining, "--expires");
  remaining = r6;

  const [category, ...contentParts] = remaining;
  const content = contentParts.join(" ");
  if (!category || !content) usage();

  if (!CATEGORIES.includes(category as KBCategory)) {
    console.error(`Invalid category: ${category}. Must be one of: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  if (originRaw && !ORIGINS.includes(originRaw as KBOrigin)) {
    console.error(`Invalid origin: ${originRaw}. Must be one of: ${ORIGINS.join(", ")}`);
    process.exit(1);
  }

  if (volatilityRaw && !VOLATILITIES.includes(volatilityRaw as KBVolatility)) {
    console.error(`Invalid volatility: ${volatilityRaw}. Must be one of: ${VOLATILITIES.join(", ")}`);
    process.exit(1);
  }

  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  const origin = (originRaw as KBOrigin | undefined) ?? (source === "cli" || !source ? undefined : undefined);
  const confidence = confidenceRaw ? parseFloat(confidenceRaw) : undefined;

  if (confidence !== undefined && (isNaN(confidence) || confidence < 0 || confidence > 1)) {
    console.error("Confidence must be a number between 0 and 1.");
    process.exit(1);
  }

  const engine = getEngine();
  const entry = await engine.add(category as KBCategory, content, {
    source: source ?? "cli",
    origin,
    confidence,
    volatility: volatilityRaw as KBVolatility | undefined,
    expiresAt: expiresAt ?? undefined,
    tags,
  });
  console.log(`Added: ${entry.category}/${entry.id}`);
  console.log(`Content: ${entry.content.slice(0, 100)}${entry.content.length > 100 ? "..." : ""}`);
  console.log(`Origin: ${entry.origin} (confidence: ${entry.confidence.toFixed(1)}, ${entry.volatility})`);
  if (entry.source) console.log(`Source: ${entry.source}`);
  if (entry.tags.length > 0) console.log(`Tags: ${entry.tags.join(", ")}`);
  if (entry.expiresAt) console.log(`Expires: ${entry.expiresAt}`);
  engine.close();
}

async function handleSearch(args: string[]): Promise<void> {
  let remaining = args;
  const { value: originRaw, rest: r1 } = extractFlag(remaining, "--origin");
  remaining = r1;

  const query = remaining.join(" ");
  if (!query) usage();

  if (originRaw && !ORIGINS.includes(originRaw as KBOrigin)) {
    console.error(`Invalid origin: ${originRaw}. Must be one of: ${ORIGINS.join(", ")}`);
    process.exit(1);
  }

  const engine = getEngine();
  const results = await engine.search(query, {
    limit: 10,
    origin: originRaw as KBOrigin | undefined,
  });

  if (results.length === 0) {
    console.log("No results found.");
  } else {
    for (const r of results) {
      const tags = r.entry.tags.length > 0 ? ` [${r.entry.tags.join(", ")}]` : "";
      const meta = `${r.entry.origin}, conf=${r.entry.confidence.toFixed(1)}`;
      console.log(`\n${r.entry.category}/${r.entry.id} (score: ${r.score.toFixed(4)}, ${r.method}, ${meta})${tags}`);
      console.log(`  ${r.entry.content}`);
    }
    console.log(`\n${results.length} result(s)`);
  }
  engine.close();
}

function handleList(args: string[]): void {
  let remaining = args;
  const { value: originRaw, rest: r1 } = extractFlag(remaining, "--origin");
  remaining = r1;

  const [category] = remaining;
  if (category && !CATEGORIES.includes(category as KBCategory)) {
    console.error(`Invalid category: ${category}. Must be one of: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  if (originRaw && !ORIGINS.includes(originRaw as KBOrigin)) {
    console.error(`Invalid origin: ${originRaw}. Must be one of: ${ORIGINS.join(", ")}`);
    process.exit(1);
  }

  const engine = getEngine();
  const entries = engine.list(
    category as KBCategory | undefined,
    originRaw as KBOrigin | undefined,
  );

  if (entries.length === 0) {
    const filter = [category, originRaw].filter(Boolean).join(", ") || "any";
    console.log(`No entries matching (${filter}).`);
  } else {
    for (const e of entries) {
      const preview = e.content.length > 80 ? e.content.slice(0, 80) + "..." : e.content;
      console.log(`${e.category}/${e.id} [${e.origin}]: ${preview}`);
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

  console.log(`ID:         ${entry.id}`);
  console.log(`Category:   ${entry.category}`);
  console.log(`Origin:     ${entry.origin}`);
  console.log(`Confidence: ${entry.confidence.toFixed(2)}`);
  console.log(`Volatility: ${entry.volatility}`);
  if (entry.expiresAt) console.log(`Expires:    ${entry.expiresAt}`);
  console.log(`Source:     ${entry.source || "(none)"}`);
  console.log(`Tags:       ${entry.tags.length > 0 ? entry.tags.join(", ") : "(none)"}`);
  console.log(`Created:    ${entry.createdAt}`);
  console.log(`Updated:    ${entry.updatedAt}`);
  if (Object.keys(entry.metadata).length > 0) {
    console.log(`Metadata:   ${JSON.stringify(entry.metadata)}`);
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
        origin: "imported",
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
      origin: entry.origin,
      confidence: entry.confidence,
      volatility: entry.volatility,
      expiresAt: entry.expiresAt ?? undefined,
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
  console.log(`  By origin:`);
  for (const [origin, count] of Object.entries(s.byOrigin)) {
    if (count > 0) console.log(`    ${origin}: ${count}`);
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

async function handleVideoIngest(args: string[]): Promise<void> {
  let remaining = args;
  const { value: intervalStr, rest: r1 } = extractFlag(remaining, "--interval");
  remaining = r1;
  const { value: lang, rest: r2 } = extractFlag(remaining, "--lang");
  remaining = r2;
  const { value: maxFramesStr, rest: r3 } = extractFlag(remaining, "--max-frames");
  remaining = r3;
  const { value: tagsRaw, rest: r4 } = extractFlag(remaining, "--tags");
  remaining = r4;
  const dryRun = remaining.includes("--dry-run");
  remaining = remaining.filter(a => a !== "--dry-run");

  const urlOrPath = remaining[0];
  if (!urlOrPath) {
    console.error("Usage: video-ingest <url-or-path> [--interval 60] [--lang en] [--max-frames 30] [--tags t,t] [--dry-run]");
    process.exit(1);
  }

  const result = await videoIngest(urlOrPath, {
    intervalSec: intervalStr ? Number(intervalStr) : undefined,
    lang: lang ?? "en",
    maxFrames: maxFramesStr ? Number(maxFramesStr) : undefined,
    tags: tagsRaw ? tagsRaw.split(",").map(t => t.trim()) : undefined,
    dryRun,
  });

  console.log("\n✓ Video ingest complete");
  console.log(`  KB entry: ${result.entryId}`);
  console.log(`  Title:    ${result.title}`);
  console.log(`  Frames:   ${result.frameCount} screenshots in ${result.mediaDir}`);
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
    case "video-ingest":       await handleVideoIngest(args); break;
    default:                   usage();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
