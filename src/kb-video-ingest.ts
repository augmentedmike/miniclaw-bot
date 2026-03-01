/**
 * kb-video-ingest.ts — Transcribe a YouTube/local video, extract learnable
 * fact segments using LLM, screenshot at those exact timestamps, and store
 * each fact as its own KB entry with its screenshot.
 *
 * Usage (via kb-cli.ts):
 *   miniclaw-kb video-ingest <url-or-path> [--lang en] [--model haiku]
 *
 * Each extracted fact gets its own KB entry:
 *   content   = fact text as stated in transcript
 *   metadata  = { url, title, ts, tsFormatted, screenshotPath, sourceText }
 *   tags      = ["video", "youtube", "fact", ...]
 *   origin    = "read"
 *
 * Dependencies: yt-dlp, ffmpeg (brew install yt-dlp ffmpeg)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getAccessToken } from "./auth.js";
import { KBEngine } from "./kb/engine.js";
import { getActivePersonaHome, ensurePersonaDirs, loadConfig } from "./config.js";

// ── Types ─────────────────────────────────────────────────────────────────

export type TranscriptSegment = {
  start: number;    // seconds
  end: number;
  text: string;
};

export type FactSegment = {
  startSec: number;       // exact timestamp for screenshot
  endSec: number;
  tsFormatted: string;    // HH:MM:SS
  sourceText: string;     // raw transcript text for this segment
  factSummary: string;    // LLM-distilled fact statement
  category: string;       // "principle" | "definition" | "statistic" | "how-to" | "insight"
};

export type VideoIngestResult = {
  videoId: string;
  title: string;
  url: string;
  durationSec: number;
  factsExtracted: number;
  kbEntryIds: string[];
  mediaDir: string;
};

export type VideoIngestOptions = {
  lang?: string;
  model?: string;        // anthropic model for fact extraction (default: haiku)
  maxFacts?: number;     // cap on facts per video (default: 25)
  tags?: string[];
  dryRun?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────

function formatTs(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function ytdlpBin(): string {
  for (const p of ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp"]) {
    if (fs.existsSync(p)) return p;
  }
  try { return execSync("which yt-dlp", { stdio: "pipe", encoding: "utf8" }).trim(); } catch { /**/ }
  throw new Error("yt-dlp not found. Install with: brew install yt-dlp");
}

function ffmpegBin(): string {
  for (const p of ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    if (fs.existsSync(p)) return p;
  }
  try { return execSync("which ffmpeg", { stdio: "pipe", encoding: "utf8" }).trim(); } catch { /**/ }
  throw new Error("ffmpeg not found. Install with: brew install ffmpeg");
}

function run(cmd: string, silent = true): string {
  return execSync(cmd, {
    stdio: silent ? "pipe" : ["pipe", "pipe", "inherit"],
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
}

// ── Subtitle parsing ──────────────────────────────────────────────────────

function parseTsToSec(ts: string): number {
  const [hms, ms = "0"] = ts.replace(",", ".").split(".");
  const parts = (hms ?? "").split(":").map(Number);
  const [h = 0, m = 0, s = 0] = parts;
  return h * 3600 + m * 60 + s + Number("0." + ms);
}

export function parseVTT(content: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    const match = line.match(/^(\d+:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d+:\d{2}:\d{2}[.,]\d{3})/);
    if (match) {
      const start = parseTsToSec(match[1]!);
      const end = parseTsToSec(match[2]!);
      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== "" && !/^\d+$/.test(lines[i]!.trim())) {
        const clean = lines[i]!.trim().replace(/<[^>]+>/g, "").trim();
        if (clean) textLines.push(clean);
        i++;
      }
      if (textLines.length) {
        segments.push({ start, end, text: textLines.join(" ") });
      }
    }
    i++;
  }
  // Deduplicate consecutive identical text (auto-captions repeat)
  return segments.filter((s, i, arr) => i === 0 || s.text !== arr[i - 1]!.text);
}

/** Merge short segments into chunks of ~30s for LLM context efficiency */
function chunkSegments(segs: TranscriptSegment[], windowSec = 30): TranscriptSegment[] {
  const chunks: TranscriptSegment[] = [];
  let current: TranscriptSegment | null = null;

  for (const seg of segs) {
    if (!current) {
      current = { ...seg };
    } else if (seg.start - current.start < windowSec) {
      current.end = seg.end;
      current.text += " " + seg.text;
    } else {
      chunks.push(current);
      current = { ...seg };
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ── LLM fact extraction ───────────────────────────────────────────────────

const FACT_EXTRACTION_PROMPT = `You are an expert knowledge curator. You will receive transcript chunks from a video.
Your job: identify segments that contain LEARNABLE FACTS worth storing in a knowledge base.

A learnable fact is:
- A concrete principle, technique, or insight that can change how someone thinks or works
- A definition of an important concept
- A statistic or research finding with specifics
- A step-by-step how-to that can be acted upon
- A named pattern or anti-pattern with explanation

NOT a learnable fact:
- Introductions, preamble, "today we'll cover..."
- Transitions, "so as we saw above..."
- Vague opinions without substance
- Filler or off-topic tangents
- Promotional content

For each learnable fact found, output JSON in this exact format (one per line, no wrapper):
{"startSec": <number>, "endSec": <number>, "category": "<principle|definition|statistic|how-to|insight>", "factSummary": "<concise fact statement, 1-2 sentences, self-contained>", "sourceText": "<verbatim or near-verbatim quote from transcript>"}

If a chunk has no learnable facts, output nothing for it.
Only output JSON lines, no explanation, no markdown.`;

export async function extractFactSegments(
  chunks: TranscriptSegment[],
  videoTitle: string,
  model = "claude-haiku-4-5",
): Promise<FactSegment[]> {
  // Use OAuth auth matching the rest of the miniclaw agent
  const accessToken = await getAccessToken();
  const oauthFetch: typeof globalThis.fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete("x-api-key");
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("anthropic-beta", "oauth-2025-04-20");
    return globalThis.fetch(input, { ...init, headers });
  };
  const anthropic = createAnthropic({ apiKey: "oauth-placeholder", fetch: oauthFetch });

  const transcriptText = chunks
    .map(c => `[${formatTs(c.start)} - ${formatTs(c.end)}] ${c.text}`)
    .join("\n");

  const userMsg = `Video: "${videoTitle}"

Transcript (with timestamps):
${transcriptText}

Extract all learnable facts. Output one JSON object per line.`;

  const { text: raw } = await generateText({
    model: anthropic(model),
    system: FACT_EXTRACTION_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    maxTokens: 4096,
  });

  const facts: FactSegment[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        startSec: number;
        endSec: number;
        category: string;
        factSummary: string;
        sourceText: string;
      };
      if (typeof parsed.startSec !== "number" || !parsed.factSummary) continue;
      facts.push({
        startSec: parsed.startSec,
        endSec: parsed.endSec ?? parsed.startSec + 10,
        tsFormatted: formatTs(parsed.startSec),
        sourceText: parsed.sourceText ?? "",
        factSummary: parsed.factSummary,
        category: parsed.category ?? "insight",
      });
    } catch { /* skip malformed lines */ }
  }

  // Sort by timestamp
  facts.sort((a, b) => a.startSec - b.startSec);
  return facts;
}

// ── Screenshot extraction ─────────────────────────────────────────────────

function extractFrame(
  ffmpeg: string,
  videoFile: string,
  timeSec: number,
  outPath: string,
): boolean {
  const ts = formatTs(timeSec) + ".000";
  try {
    run(
      `${ffmpeg} -ss ${ts} -i "${videoFile}" -frames:v 1 -q:v 2 "${outPath}" -y`,
    );
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 1000;
  } catch {
    return false;
  }
}

// ── Core ingest ───────────────────────────────────────────────────────────

export async function videoIngest(
  urlOrPath: string,
  opts: VideoIngestOptions = {},
): Promise<VideoIngestResult> {
  const lang = opts.lang ?? "en";
  const model = opts.model ?? "claude-haiku-4-5";
  const maxFacts = opts.maxFacts ?? 25;
  const extraTags = opts.tags ?? [];
  const isUrl = /^https?:\/\//.test(urlOrPath);

  const ytdlp = ytdlpBin();
  const ffmpeg = ffmpegBin();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-video-"));

  try {
    // ── Step 1: Video metadata ─────────────────────────────────────
    console.log("→ Getting video info...");
    const infoRaw = run(`${ytdlp} --dump-json --no-warnings "${urlOrPath}"`);
    const info = JSON.parse(infoRaw);
    const title: string = info.title ?? "Untitled";
    const durationSec: number = info.duration ?? 0;
    const videoId: string = info.id ?? `local-${Date.now()}`;

    console.log(`→ "${title}" (${formatTs(durationSec)})`);

    // ── Step 2: Download subtitles ─────────────────────────────────
    console.log("→ Downloading subtitles...");
    let subtitleContent = "";
    try {
      run(
        `${ytdlp} --write-subs --write-auto-subs --sub-lang "${lang}" ` +
        `--skip-download --sub-format vtt ` +
        `--output "${path.join(tmpDir, "subs")}" "${urlOrPath}"`,
      );
      const vttFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith(".vtt"));
      if (vttFiles.length > 0) {
        subtitleContent = fs.readFileSync(path.join(tmpDir, vttFiles[0]!), "utf8");
      }
    } catch { /* no subtitles available */ }

    if (!subtitleContent) {
      console.warn("⚠ No subtitles found — cannot extract facts without transcript");
      return { videoId, title, url: urlOrPath, durationSec, factsExtracted: 0, kbEntryIds: [], mediaDir: "" };
    }

    const segments = parseVTT(subtitleContent);
    const chunks = chunkSegments(segments, 30);
    console.log(`→ Transcript: ${segments.length} segments → ${chunks.length} chunks`);

    // ── Step 3: LLM fact extraction ────────────────────────────────
    console.log(`→ Extracting learnable facts via ${model}...`);
    let facts = await extractFactSegments(chunks, title, model);
    facts = facts.slice(0, maxFacts);
    console.log(`→ Found ${facts.length} learnable fact(s)`);

    if (facts.length === 0) {
      console.log("  No learnable facts found in transcript.");
      return { videoId, title, url: urlOrPath, durationSec, factsExtracted: 0, kbEntryIds: [], mediaDir: "" };
    }

    if (opts.dryRun) {
      console.log("\n[dry-run] Facts that would be extracted:");
      facts.forEach((f, i) => {
        console.log(`  ${i + 1}. [${f.tsFormatted}] [${f.category}] ${f.factSummary}`);
      });
      return { videoId, title, url: urlOrPath, durationSec, factsExtracted: facts.length, kbEntryIds: [], mediaDir: "" };
    }

    // ── Step 4: Download video for frame extraction ────────────────
    console.log("→ Downloading video for screenshot extraction...");
    let videoFile = urlOrPath;
    if (isUrl) {
      run(
        `${ytdlp} --format "bestvideo[height<=720][ext=mp4]+bestaudio/best[height<=720]" ` +
        `--merge-output-format mp4 ` +
        `--output "${path.join(tmpDir, "video.%(ext)s")}" "${urlOrPath}"`,
        false,
      );
      const mp4Files = fs.readdirSync(tmpDir).filter(f => f.startsWith("video."));
      if (mp4Files.length === 0) throw new Error("Video download failed");
      videoFile = path.join(tmpDir, mp4Files[0]!);
    }

    // ── Step 5: Set up media directory ─────────────────────────────
    const config = loadConfig();
    const personaName = config.activePersona ?? "default";
    ensurePersonaDirs(personaName);
    const personaHome = getActivePersonaHome(config);
    const mediaDir = path.join(personaHome, "kb", "media", `yt-${videoId}`);
    fs.mkdirSync(mediaDir, { recursive: true });

    // ── Step 6: Screenshot at each fact timestamp + store KB ───────
    const dbPath = path.join(personaHome, "kb", "vectors.db");
    const engine = new KBEngine(dbPath);
    const kbEntryIds: string[] = [];
    let screenshotCount = 0;

    for (const fact of facts) {
      // Screenshot at the start of this fact segment
      const ssFile = path.join(mediaDir, `fact_${String(Math.floor(fact.startSec)).padStart(6, "0")}.jpg`);
      const hasScreenshot = extractFrame(ffmpeg, videoFile, fact.startSec, ssFile);
      if (hasScreenshot) screenshotCount++;

      const content =
        `[${fact.category.toUpperCase()}] ${fact.factSummary}\n\n` +
        `Source: "${fact.sourceText}"\n` +
        `Video: ${title} @ ${fact.tsFormatted}\n` +
        `URL: ${urlOrPath}?t=${Math.floor(fact.startSec)}`;

      const metadata: Record<string, string> = {
        type: "video-fact",
        category: fact.category,
        videoId,
        videoTitle: title,
        url: urlOrPath,
        deepLink: `${urlOrPath}?t=${Math.floor(fact.startSec)}`,
        tsFormatted: fact.tsFormatted,
        startSec: String(fact.startSec),
        sourceText: fact.sourceText,
        screenshotPath: hasScreenshot ? ssFile : "",
        ingestedAt: new Date().toISOString(),
      };

      const entry = await engine.add("fact", content, {
        source: `${urlOrPath}?t=${Math.floor(fact.startSec)}`,
        origin: "read",
        confidence: 0.82,
        volatility: "stable",
        tags: ["video", "youtube", `cat:${fact.category}`, ...extraTags],
        metadata,
      });

      kbEntryIds.push(entry.id);
      console.log(`  ✓ [${fact.tsFormatted}] [${fact.category}] ${fact.factSummary.slice(0, 70)}${hasScreenshot ? " 📸" : ""}`);
    }

    engine.close();

    console.log(`\n✓ Ingested "${title}"`);
    console.log(`  Facts: ${facts.length} | Screenshots: ${screenshotCount} | KB entries: ${kbEntryIds.length}`);
    console.log(`  Media: ${mediaDir}`);

    return { videoId, title, url: urlOrPath, durationSec, factsExtracted: facts.length, kbEntryIds, mediaDir };

  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /**/ }
  }
}
