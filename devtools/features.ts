/**
 * Feature map generator — business-level feature extraction from code.
 *
 * Scans the codebase and synthesizes a product feature list from:
 *   - Module-level JSDoc comments (the "why" of each file)
 *   - Tool descriptions (user-facing capability language)
 *   - Package dependencies (technology → capability mapping)
 *   - Directory structure (feature clustering)
 *   - Export signatures (public API surface)
 *
 * This is the business counterpart to docgen: where docgen produces
 * API documentation for developers, features.ts produces a product
 * spec that a non-technical stakeholder could read.
 *
 * Usage:
 *   npx tsx devtools/features.ts [--root src/] [--format text|json|markdown]
 */

import fs from "node:fs";
import path from "node:path";

// --- Types ---

export type Feature = {
  name: string;
  description: string;
  files: string[];
  capabilities: string[];
  dependencies: string[];
};

export type FeatureMap = {
  product: string;
  version: string;
  features: Feature[];
  stats: {
    totalFeatures: number;
    totalFiles: number;
    totalCapabilities: number;
  };
};

// --- Dependency → Capability Mapping ---

const DEP_CAPABILITY_MAP: Record<string, { feature: string; capability: string }> = {
  "ai": { feature: "AI Assistant", capability: "Multi-step reasoning with tool use" },
  "@ai-sdk/anthropic": { feature: "AI Assistant", capability: "Claude language model (Anthropic)" },
  "@ai-sdk/openai": { feature: "AI Assistant", capability: "OpenAI language models" },
  "@ai-sdk/google": { feature: "AI Assistant", capability: "Google language models" },
  "grammy": { feature: "Telegram Messaging", capability: "Telegram bot message handling" },
  "@grammyjs/runner": { feature: "Telegram Messaging", capability: "Long-polling message listener" },
  "@grammyjs/transformer-throttler": { feature: "Telegram Messaging", capability: "Rate limiting for API calls" },
  "dotenv": { feature: "Configuration", capability: "Environment variable loading" },
  "zod": { feature: "AI Assistant", capability: "Structured tool parameter validation" },
};

// --- Directory → Feature Mapping ---

const DIR_FEATURE_MAP: Record<string, string> = {
  "telegram": "Telegram Messaging",
  "memory": "Persistent Memory",
  "tools": "Agent Tools",
  "web": "Web Interface",
};

// --- Tool Name → Feature Mapping ---

const TOOL_FEATURE_MAP: Record<string, string> = {
  "shell_exec": "System Access",
  "read_file": "File Management",
  "write_file": "File Management",
  "edit_file": "File Management",
  "list_directory": "File Management",
  "glob": "File Management",
  "grep": "Code Search",
  "web_fetch": "Web Access",
  "web_search": "Web Access",
  "memory_save": "Persistent Memory",
  "memory_search": "Persistent Memory",
  "memory_vector_search": "Persistent Memory",
  "memory_deep_search": "Persistent Memory",
  "claude_code": "Task Delegation",
  "vault_get": "Encrypted Vault",
  "vault_list": "Encrypted Vault",
};

// --- Extraction ---

/**
 * Extract the module-level JSDoc comment from file content.
 * Returns the first /** ... * / block if it starts within the first 15 lines.
 */
export function extractModuleDoc(content: string): string | null {
  const lines = content.split("\n").slice(0, 20);
  const block = lines.join("\n");
  const match = block.match(/\/\*\*\s*\n([\s\S]*?)\s*\*\//);
  if (!match) return null;

  return match[1]!
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ");
}

/**
 * Extract tool description strings from a tool file.
 * Looks for `description:` followed by string concatenation.
 */
export function extractToolDescriptions(content: string): string[] {
  const descriptions: string[] = [];
  const descRe = /description:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g;
  const multiRe = /description:\s*\n?\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*\n?\s*)+)/g;

  let match: RegExpExecArray | null;
  multiRe.lastIndex = 0;
  while ((match = multiRe.exec(content)) !== null) {
    const raw = match[1]!;
    // Join the concatenated strings
    const parts = raw.match(/"((?:[^"\\]|\\.)*)"/g);
    if (parts) {
      const joined = parts.map((p) => p.slice(1, -1)).join("");
      descriptions.push(joined);
    }
  }

  return descriptions;
}

/**
 * Extract export names from a file to gauge feature surface.
 */
export function extractExports(content: string): string[] {
  const exports: string[] = [];
  const re = /export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    exports.push(match[1]!);
  }
  return exports;
}

/**
 * Read package.json and extract name, version, dependencies.
 */
function readPackageJson(rootDir: string): { name: string; version: string; deps: string[] } {
  const pkgPath = path.join(rootDir, "..", "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const deps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    return { name: pkg.name ?? "unknown", version: pkg.version ?? "0.0.0", deps };
  } catch {
    return { name: "unknown", version: "0.0.0", deps: [] };
  }
}

/**
 * Scan for tool registrations in agent.ts to discover tool names.
 */
function extractToolNames(rootDir: string): string[] {
  const agentPath = path.join(rootDir, "agent.ts");
  if (!fs.existsSync(agentPath)) return [];
  const content = fs.readFileSync(agentPath, "utf8");
  const tools: string[] = [];
  const re = /(\w+):\s*(?:create\w+Tool|[\w]+Tool)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    tools.push(match[1]!);
  }
  return tools;
}

/**
 * Scan source files and synthesize business-level features.
 */
export function extractFeatures(rootDir: string): FeatureMap {
  const pkg = readPackageJson(rootDir);
  const toolNames = extractToolNames(rootDir);
  const files = findTsFiles(rootDir);

  // Collect raw data per file
  const fileData: { rel: string; dir: string; doc: string | null; tools: string[]; exports: string[] }[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(rootDir, file);
    const dir = path.dirname(rel);
    fileData.push({
      rel,
      dir: dir === "." ? "core" : dir.split("/")[0]!,
      doc: extractModuleDoc(content),
      tools: extractToolDescriptions(content),
      exports: extractExports(content),
    });
  }

  // Build feature buckets
  const featureBuckets = new Map<string, { description: string; files: Set<string>; capabilities: Set<string>; deps: Set<string> }>();

  function ensureBucket(name: string) {
    if (!featureBuckets.has(name)) {
      featureBuckets.set(name, { description: "", files: new Set(), capabilities: new Set(), deps: new Set() });
    }
    return featureBuckets.get(name)!;
  }

  // 1. Map tools to features
  for (const toolName of toolNames) {
    const featureName = TOOL_FEATURE_MAP[toolName];
    if (featureName) {
      const bucket = ensureBucket(featureName);
      bucket.capabilities.add(toolName.replace(/_/g, " "));
    }
  }

  // 2. Map dependencies to features
  for (const dep of pkg.deps) {
    const mapping = DEP_CAPABILITY_MAP[dep];
    if (mapping) {
      const bucket = ensureBucket(mapping.feature);
      bucket.capabilities.add(mapping.capability);
      bucket.deps.add(dep);
    }
  }

  // 3. Map files to features by directory and content
  for (const fd of fileData) {
    // Skip test files, CLIs, and types-only files
    if (fd.rel.endsWith(".test.ts") || fd.rel.endsWith("-cli.ts")) continue;

    const featureName = classifyFile(fd.rel, fd.dir, fd.doc, fd.exports);
    if (featureName) {
      const bucket = ensureBucket(featureName);
      bucket.files.add(fd.rel);
      if (fd.doc) {
        // Use the first sentence of the module doc as a capability
        const firstSentence = fd.doc.split(/\.\s/)[0]!.trim();
        if (firstSentence.length > 10 && firstSentence.length < 200) {
          bucket.capabilities.add(firstSentence);
        }
      }
      // Tool descriptions are great business-level capability descriptions
      for (const desc of fd.tools) {
        const firstSentence = desc.split(/\.\s/)[0]!.trim();
        if (firstSentence.length > 10) {
          bucket.capabilities.add(firstSentence);
        }
      }
    }
  }

  // 4. Generate business descriptions for each feature
  const descriptions = generateDescriptions(featureBuckets);

  // Build final feature list
  const features: Feature[] = [];
  for (const [name, bucket] of [...featureBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    features.push({
      name,
      description: descriptions.get(name) ?? bucket.description,
      files: [...bucket.files].sort(),
      capabilities: [...bucket.capabilities],
      dependencies: [...bucket.deps],
    });
  }

  const totalCapabilities = features.reduce((sum, f) => sum + f.capabilities.length, 0);

  return {
    product: pkg.name,
    version: pkg.version,
    features,
    stats: {
      totalFeatures: features.length,
      totalFiles: files.filter((f) => !f.endsWith(".test.ts")).length,
      totalCapabilities,
    },
  };
}

/**
 * Classify a file into a business feature based on its path, content, and exports.
 */
function classifyFile(rel: string, dir: string, doc: string | null, exports: string[]): string | null {
  const lower = rel.toLowerCase();
  const docLower = (doc ?? "").toLowerCase();
  const exportNames = exports.map((e) => e.toLowerCase()).join(" ");

  // Vault / secrets
  if (lower.includes("vault") || docLower.includes("encrypt") || docLower.includes("secret")) {
    return "Encrypted Vault";
  }

  // Telegram
  if (dir === "telegram" || lower.includes("telegram")) {
    return "Telegram Messaging";
  }

  // Memory
  if (dir === "memory" || lower.includes("memory")) {
    return "Persistent Memory";
  }

  // Web interface
  if (dir === "web" && !lower.includes("tools/web")) {
    return "Web Interface";
  }

  // Snapshot / backup (must come before persona check)
  if (lower.includes("snapshot") || docLower.includes("snapshot") || docLower.includes("checkpoint")) {
    return "State Snapshots";
  }

  // Install / setup (must come before persona check)
  if (lower.includes("install") || lower.includes("setup")) {
    return "Installation & Setup";
  }

  // Persona / identity
  if (lower.includes("persona") || docLower.includes("persona") || docLower.includes("identity")) {
    return "Agent Personas";
  }

  // Context / knowledge base
  if (lower.includes("context") || docLower.includes("knowledge base") || docLower.includes("kb")) {
    return "Knowledge Base";
  }

  // Conversation history
  if (lower.includes("conversation") || docLower.includes("conversation") || docLower.includes("history")) {
    return "Conversation History";
  }

  // System prompt
  if (lower.includes("system-prompt") || docLower.includes("system prompt")) {
    return "AI Assistant";
  }

  // Agent core
  if (lower.includes("agent") || docLower.includes("agent") || docLower.includes("streaming")) {
    return "AI Assistant";
  }

  // Auth
  if (lower.includes("auth") || docLower.includes("oauth") || docLower.includes("token")) {
    return "Authentication";
  }

  // Config
  if (lower.includes("config") || docLower.includes("configuration")) {
    return "Configuration";
  }

  // Tool files
  if (dir === "tools") {
    // Classify by the tool's domain
    if (lower.includes("shell") || lower.includes("run-process")) return "System Access";
    if (lower.includes("file") || lower.includes("edit") || lower.includes("glob")) return "File Management";
    if (lower.includes("grep")) return "Code Search";
    if (lower.includes("web")) return "Web Access";
    if (lower.includes("memory")) return "Persistent Memory";
    if (lower.includes("claude")) return "Task Delegation";
    if (lower.includes("util")) return null; // Internal utility
    return "Agent Tools";
  }

  // Types file
  if (lower.includes("types")) return null;

  // Fallback: classify as core
  return "AI Assistant";
}

/**
 * Generate business-friendly descriptions for each feature.
 */
function generateDescriptions(
  buckets: Map<string, { capabilities: Set<string>; files: Set<string>; deps: Set<string> }>,
): Map<string, string> {
  const desc = new Map<string, string>();

  // Static descriptions for known features — written in business language
  const known: Record<string, string> = {
    "AI Assistant":
      "Conversational AI agent that reasons through problems step-by-step, " +
      "uses tools to take action, and maintains context across interactions.",
    "Telegram Messaging":
      "Send and receive messages through a Telegram bot. Supports long " +
      "messages, rich formatting, and typing indicators. First user to " +
      "connect becomes the owner.",
    "Encrypted Vault":
      "Securely store and retrieve sensitive data — API keys, payment cards, " +
      "crypto keys, credentials, and secure notes. AES-256 encrypted, " +
      "never exposed in plaintext. Works on macOS and Linux.",
    "Persistent Memory":
      "Remembers facts, preferences, and notes across conversations and " +
      "restarts. Supports keyword search, semantic similarity search, and " +
      "deep multi-strategy search for the best results.",
    "Conversation History":
      "Maintains per-user conversation context so the agent picks up " +
      "where it left off. Old messages are automatically archived to " +
      "the knowledge base when rotated out.",
    "File Management":
      "Read, write, edit, and search files on the host system. " +
      "Supports glob patterns, directory listings, and precise " +
      "string-replacement editing.",
    "System Access":
      "Execute shell commands on the host machine with the user's " +
      "full environment. Supports configurable timeouts and optional " +
      "directory sandboxing.",
    "Web Access":
      "Fetch web pages and search the internet. Reads articles, " +
      "documentation, and API responses. Searches via DuckDuckGo " +
      "with no API key required.",
    "Code Search":
      "Search file contents using regular expressions with ripgrep. " +
      "Returns matching lines with file paths and line numbers.",
    "Task Delegation":
      "Delegate complex multi-step tasks to Claude Code, an autonomous " +
      "coding agent with full filesystem and shell access.",
    "Agent Personas":
      "Named agent profiles with custom instructions, personality, " +
      "and per-persona memory. Switch between identities for " +
      "different use cases.",
    "State Snapshots":
      "Export and restore complete agent state — like a checkpoint. " +
      "Backup persona, memory, conversations, and vault to a " +
      "portable archive.",
    "Knowledge Base":
      "Automatic context retrieval before each response. Searches " +
      "stored knowledge using BM25 ranking and vector similarity " +
      "to provide relevant background.",
    "Authentication":
      "OAuth token management for LLM provider access. Supports " +
      "Claude Code credential fallback and automatic token handling.",
    "Configuration":
      "Environment-based configuration with sensible defaults. " +
      "Model selection, timeout settings, home directory, and " +
      "persona management.",
    "Installation & Setup":
      "Interactive installer that walks through first-time setup " +
      "including persona creation and configuration.",
    "Web Interface":
      "Browser-based UI for interacting with the agent. " +
      "HTTP server with route handling and UI components.",
  };

  for (const [name, bucket] of buckets) {
    if (known[name]) {
      desc.set(name, known[name]!);
    } else {
      // Fallback: synthesize from capabilities
      const caps = [...bucket.capabilities].slice(0, 3).join(". ");
      desc.set(name, caps || "Undocumented feature.");
    }
  }

  return desc;
}

// --- Output Formatting ---

export function formatReport(rootDir: string): string {
  const map = extractFeatures(rootDir);
  return formatText(map);
}

export function formatText(map: FeatureMap): string {
  const lines: string[] = [];
  const w = 56;

  lines.push("╔" + "═".repeat(w) + "╗");
  lines.push("║" + `  FEATURE MAP — ${map.product} v${map.version}`.padEnd(w) + "║");
  lines.push("╚" + "═".repeat(w) + "╝");
  lines.push("");

  for (const feature of map.features) {
    lines.push(`▸ ${feature.name}`);
    // Word-wrap description at ~70 chars
    const wrapped = wordWrap(feature.description, 70);
    for (const line of wrapped) {
      lines.push(`  ${line}`);
    }
    if (feature.capabilities.length > 0) {
      lines.push("");
      for (const cap of feature.capabilities.slice(0, 6)) {
        lines.push(`    · ${cap}`);
      }
      if (feature.capabilities.length > 6) {
        lines.push(`    · ... and ${feature.capabilities.length - 6} more`);
      }
    }
    if (feature.files.length > 0) {
      lines.push("");
      lines.push(`    Files: ${feature.files.join(", ")}`);
    }
    if (feature.dependencies.length > 0) {
      lines.push(`    Deps:  ${feature.dependencies.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("─".repeat(w + 2));
  lines.push(
    `${map.stats.totalFeatures} features | ${map.stats.totalFiles} source files | ${map.stats.totalCapabilities} capabilities`,
  );

  return lines.join("\n");
}

export function formatMarkdown(map: FeatureMap): string {
  const lines: string[] = [];

  lines.push(`# Feature Map — ${map.product} v${map.version}`);
  lines.push("");
  lines.push(`> ${map.stats.totalFeatures} features | ${map.stats.totalFiles} source files | ${map.stats.totalCapabilities} capabilities`);
  lines.push("");

  for (const feature of map.features) {
    lines.push(`## ${feature.name}`);
    lines.push("");
    lines.push(feature.description);
    lines.push("");

    if (feature.capabilities.length > 0) {
      lines.push("**Capabilities:**");
      for (const cap of feature.capabilities) {
        lines.push(`- ${cap}`);
      }
      lines.push("");
    }

    if (feature.files.length > 0) {
      lines.push(`**Files:** \`${feature.files.join("`, `")}\``);
      lines.push("");
    }

    if (feature.dependencies.length > 0) {
      lines.push(`**Dependencies:** ${feature.dependencies.join(", ")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function formatJson(map: FeatureMap): string {
  return JSON.stringify(map, null, 2);
}

// --- Helpers ---

function wordWrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > width && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !["node_modules", "dist", "coverage"].includes(entry.name)) {
      results.push(...findTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

// --- CLI ---
if (process.argv[1]?.endsWith("features.ts")) {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf("--root");
  const rootDir = path.resolve(rootIdx !== -1 ? args[rootIdx + 1] ?? "src" : "src");
  const fmtIdx = args.indexOf("--format");
  const format = fmtIdx !== -1 ? args[fmtIdx + 1] ?? "text" : "text";

  const map = extractFeatures(rootDir);

  switch (format) {
    case "json":
      console.log(formatJson(map));
      break;
    case "markdown":
    case "md":
      console.log(formatMarkdown(map));
      break;
    default:
      console.log(formatText(map));
  }
}
