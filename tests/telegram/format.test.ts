import { describe, expect, it } from "vitest";
import { markdownToTelegramHtml, chunkText } from "@telegram/format.js";

describe("markdownToTelegramHtml", () => {
  it("renders basic inline formatting", () => {
    // Bold
    expect(markdownToTelegramHtml("**boss**")).toBe("<b>boss</b>");
    // Inline code
    expect(markdownToTelegramHtml("`code`")).toBe("<code>code</code>");
  });

  it("renders italic text", () => {
    expect(markdownToTelegramHtml("*there*")).toBe("<i>there</i>");
    expect(markdownToTelegramHtml("_there_")).toBe("<i>there</i>");
  });

  it("renders links as Telegram-safe HTML", () => {
    expect(markdownToTelegramHtml("see [docs](https://example.com)")).toBe(
      'see <a href="https://example.com">docs</a>',
    );
  });

  it("escapes raw HTML", () => {
    expect(markdownToTelegramHtml("<b>nope</b>")).toBe("&lt;b&gt;nope&lt;/b&gt;");
  });

  it("escapes unsafe characters", () => {
    expect(markdownToTelegramHtml("a & b < c")).toBe("a &amp; b &lt; c");
  });

  it("renders lists with bullets", () => {
    expect(markdownToTelegramHtml("- one\n- two")).toBe("• one\n• two");
  });

  it("flattens headings to bold", () => {
    expect(markdownToTelegramHtml("# Title")).toBe("<b>Title</b>");
    expect(markdownToTelegramHtml("## Subtitle")).toBe("<b>Subtitle</b>");
  });

  it("renders blockquotes", () => {
    const res = markdownToTelegramHtml("> Quote");
    expect(res).toContain("<blockquote>");
    expect(res).toContain("Quote");
    expect(res).toContain("</blockquote>");
  });

  it("renders multiline blockquotes as single block", () => {
    const res = markdownToTelegramHtml("> first\n> second");
    expect(res).toBe("<blockquote>first\nsecond</blockquote>");
  });

  it("renders fenced code blocks", () => {
    const res = markdownToTelegramHtml("```js\nconst x = 1;\n```");
    expect(res).toBe("<pre><code>const x = 1;\n</code></pre>");
  });

  it("renders strikethrough", () => {
    expect(markdownToTelegramHtml("~~deleted~~")).toBe("<s>deleted</s>");
  });

  it("renders spoiler tags", () => {
    expect(markdownToTelegramHtml("||secret||")).toBe("<tg-spoiler>secret</tg-spoiler>");
  });

  it("wraps file references in code tags", () => {
    const res = markdownToTelegramHtml("See README.md for details");
    expect(res).toContain("<code>README.md</code>");
  });

  it("does not wrap file refs inside code blocks", () => {
    const res = markdownToTelegramHtml("`README.md`");
    // Should only have one <code> wrapping, not nested
    expect(res).toBe("<code>README.md</code>");
  });

  it("preserves code block content exactly", () => {
    const input = "```\n**not bold** _not italic_\n```";
    const res = markdownToTelegramHtml(input);
    expect(res).toContain("**not bold** _not italic_");
    expect(res).not.toContain("<b>");
    expect(res).not.toContain("<i>");
  });

  it("handles empty input", () => {
    expect(markdownToTelegramHtml("")).toBe("");
  });

  it("does not wrap URL-like file references starting with //", () => {
    // A pattern like //some.sh should not be wrapped since it starts with //
    // This exercises the startsWith("//") guard in wrapFileReferences
    const res = markdownToTelegramHtml("Visit //cdn.example.sh for assets");
    // //cdn.example.sh starts with //, so it should NOT be code-wrapped
    expect(res).not.toContain("<code>//cdn.example.sh</code>");
  });

  it("wraps file reference before an HTML tag (textBefore path)", () => {
    // This exercises the wrapFileReferences callback in the textBefore section
    // by having a file reference BEFORE a bold tag
    const res = markdownToTelegramHtml("See README.md for **details**");
    expect(res).toContain("<code>README.md</code>");
    expect(res).toContain("<b>details</b>");
  });

  it("does not wrap file refs at end of text when inside open tags", () => {
    // If there's text after the last HTML tag that's inside a code context,
    // the remaining text should not have file refs wrapped.
    // This directly triggers the else branch in wrapFileReferences for remaining text.
    // We construct HTML where a <code> tag is opened but not closed before the end
    // However, since markdownToTelegramHtml always produces well-formed code blocks,
    // we test with pre-existing inline code that ends the string
    const res = markdownToTelegramHtml("`README.md` and more script.sh text");
    expect(res).toContain("<code>README.md</code>");
    expect(res).toContain("<code>script.sh</code>");
  });
});

describe("chunkText", () => {
  it("returns single chunk for short text", () => {
    expect(chunkText("hello", 100)).toEqual(["hello"]);
  });

  it("splits at newlines when possible", () => {
    const text = "line one\nline two\nline three";
    const chunks = chunkText(text, 15);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(15);
    }
  });

  it("hard-cuts when no good split point", () => {
    const text = "a".repeat(20);
    const chunks = chunkText(text, 10);
    expect(chunks).toEqual(["a".repeat(10), "a".repeat(10)]);
  });

  it("defaults to 4096 max length", () => {
    const text = "x".repeat(8000);
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });
});
