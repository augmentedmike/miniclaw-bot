import { z } from "zod";
import { tool } from "ai";
import { formatToolError } from "./util.js";

export const webFetchTool = tool({
  description:
    "Fetch a URL and return its content as readable text. " +
    "Strips HTML tags and extracts the main content. " +
    "Use for reading articles, documentation, API responses, etc.",
  parameters: z.object({
    url: z.string().url().describe("The URL to fetch"),
    max_chars: z.number().optional().describe("Max characters to return (default: 20000)"),
  }),
  execute: async ({ url, max_chars }) => {
    const limit = max_chars ?? 20_000;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Miniclaw/1.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        return `[error] HTTP ${response.status} ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();

      let text: string;
      if (contentType.includes("text/html") || contentType.includes("xhtml")) {
        text = htmlToText(body);
      } else {
        text = body;
      }

      if (text.length > limit) {
        return text.slice(0, limit) + `\n\n[truncated at ${limit} chars — full page is ${text.length} chars]`;
      }
      return text || "[empty response]";
    } catch (err) {
      return formatToolError(err);
    }
  },
});

export const webSearchTool = tool({
  description:
    "Search the web and return results. Uses DuckDuckGo HTML search (no API key needed). " +
    "Returns titles, URLs, and snippets for the top results.",
  parameters: z.object({
    query: z.string().describe("Search query"),
    max_results: z.number().optional().describe("Max results to return (default: 5)"),
  }),
  execute: async ({ query, max_results }) => {
    const limit = max_results ?? 5;
    try {
      // Use DuckDuckGo HTML — no API key required
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return `[error] Search failed: HTTP ${response.status}`;
      }

      const html = await response.text();
      const results = parseDuckDuckGoResults(html, limit);

      if (results.length === 0) {
        return `No results for "${query}"`;
      }

      return results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join("\n\n");
    } catch (err) {
      return formatToolError(err);
    }
  },
});

/**
 * Basic HTML to readable text conversion.
 * Strips tags, decodes entities, collapses whitespace.
 */
function htmlToText(html: string): string {
  let text = html;
  // Remove script and style blocks
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");
  // Convert block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/**
 * Parse DuckDuckGo HTML search results.
 */
function parseDuckDuckGoResults(
  html: string,
  limit: number,
): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  // DuckDuckGo result blocks: <a class="result__a" href="...">title</a>
  // and <a class="result__snippet" ...>snippet</a>
  const resultBlockRe = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const titles: Array<{ url: string; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = resultBlockRe.exec(html)) !== null) {
    let url = match[1] ?? "";
    // DuckDuckGo wraps URLs in a redirect — extract the actual URL
    const udMatch = url.match(/uddg=([^&]+)/);
    if (udMatch) {
      url = decodeURIComponent(udMatch[1]!);
    }
    const title = (match[2] ?? "").replace(/<[^>]+>/g, "").trim();
    if (title && url) {
      titles.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetRe.exec(html)) !== null) {
    snippets.push((match[1] ?? "").replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < Math.min(titles.length, limit); i++) {
    results.push({
      title: titles[i]!.title,
      url: titles[i]!.url,
      snippet: snippets[i] ?? "",
    });
  }

  return results;
}
