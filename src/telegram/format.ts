/**
 * Markdown → Telegram HTML conversion.
 *
 * Telegram's parse_mode: "HTML" supports a limited tag set:
 *   <b>, <i>, <s>, <code>, <pre><code>, <a href>, <blockquote>, <tg-spoiler>
 *
 * This module converts common markdown patterns to that tag set.
 * Adapted from OpenClaw's src/telegram/format.ts.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * File extensions that share TLDs. We wrap these in <code> to prevent
 * Telegram from generating spurious domain registrar previews.
 */
const FILE_EXTENSIONS_WITH_TLD = new Set([
  "md", "go", "py", "pl", "sh", "am", "at", "be", "cc",
]);

const FILE_EXT_PATTERN = Array.from(FILE_EXTENSIONS_WITH_TLD).join("|");
const FILE_REF_RE = new RegExp(
  `(^|[^a-zA-Z0-9_\\-/])([a-zA-Z0-9_.\\-/]+\\.(?:${FILE_EXT_PATTERN}))(?=$|[^a-zA-Z0-9_\\-/])`,
  "gi",
);

/**
 * Convert markdown text to Telegram-safe HTML.
 */
export function markdownToTelegramHtml(markdown: string): string {
  if (!markdown) return "";

  let text = markdown;

  // Fenced code blocks first (preserve content from further processing)
  const codeBlocks: string[] = [];
  text = text.replace(/```(?:\w*)\n?([\s\S]*?)```/g, (_match, code: string) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // Inline code (preserve from further processing)
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00INLINE${idx}\x00`;
  });

  // Escape HTML in remaining text
  text = escapeHtml(text);

  // Links: [text](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, url: string) =>
      `<a href="${url.replace(/"/g, "&quot;")}">${label}</a>`,
  );

  // Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic: *text* or _text_ (careful not to match inside words/paths)
  text = text.replace(/(?<![a-zA-Z0-9_])\*([^*\n]+?)\*(?![a-zA-Z0-9_])/g, "<i>$1</i>");
  text = text.replace(/(?<![a-zA-Z0-9_])_([^_\n]+?)_(?![a-zA-Z0-9_])/g, "<i>$1</i>");

  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");

  // Spoilers: ||text||
  text = text.replace(/\|\|(.+?)\|\|/g, "<tg-spoiler>$1</tg-spoiler>");

  // Blockquotes: > text
  text = text.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  // Merge adjacent blockquotes
  text = text.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  // Headings: strip # prefix, keep as bold
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  // Unordered lists: - item or * item → bullet
  text = text.replace(/^[-*]\s+/gm, "• ");

  // Restore code blocks and inline code
  text = text.replace(/\x00CODEBLOCK(\d+)\x00/g, (_match, idx: string) => codeBlocks[parseInt(idx)]!);
  text = text.replace(/\x00INLINE(\d+)\x00/g, (_match, idx: string) => inlineCodes[parseInt(idx)]!);

  // Wrap file references to prevent Telegram link previews
  text = wrapFileReferences(text);

  return text;
}

/**
 * Wrap bare file references (README.md, script.sh, etc.) in <code> tags
 * to prevent Telegram from treating them as domain links.
 * Skips content already inside <code>, <pre>, or <a> tags.
 */
function wrapFileReferences(html: string): string {
  const tagRe = /(<\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?>/gi;
  let codeDepth = 0;
  let preDepth = 0;
  let anchorDepth = 0;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  tagRe.lastIndex = 0;
  while ((match = tagRe.exec(html)) !== null) {
    const textBefore = html.slice(lastIndex, match.index);
    if (codeDepth === 0 && preDepth === 0 && anchorDepth === 0 && textBefore) {
      result += textBefore.replace(FILE_REF_RE, (m, prefix: string, filename: string) => {
        if (filename.startsWith("//")) return m;
        return `${prefix}<code>${filename}</code>`;
      });
    } else {
      result += textBefore;
    }

    const isClosing = match[1] === "</";
    const tagName = match[2]!.toLowerCase();
    if (tagName === "code") codeDepth = isClosing ? Math.max(0, codeDepth - 1) : codeDepth + 1;
    else if (tagName === "pre") preDepth = isClosing ? Math.max(0, preDepth - 1) : preDepth + 1;
    else if (tagName === "a") anchorDepth = isClosing ? Math.max(0, anchorDepth - 1) : anchorDepth + 1;

    result += match[0];
    lastIndex = tagRe.lastIndex;
  }

  // Process remaining text
  const remaining = html.slice(lastIndex);
  if (codeDepth === 0 && preDepth === 0 && anchorDepth === 0 && remaining) {
    result += remaining.replace(FILE_REF_RE, (m, prefix: string, filename: string) => {
      if (filename.startsWith("//")) return m;
      return `${prefix}<code>${filename}</code>`;
    });
  } else {
    result += remaining;
  }

  return result;
}

/**
 * Chunk text at a max length boundary, respecting Telegram's 4096 char limit.
 * Tries to split at newlines, then spaces, then hard-cuts.
 */
export function chunkText(text: string, maxLen: number = 4096): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt <= 0) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);

  return chunks;
}
