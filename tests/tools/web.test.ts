import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { webFetchTool, webSearchTool } from "@tools/web.js";

const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("web_fetch tool", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("fetches and strips HTML to text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html><body><h1>Title</h1><p>Hello world</p></body></html>",
    });

    const result = await webFetchTool.execute({ url: "https://example.com", max_chars: undefined }, ctx);
    expect(result).toContain("Title");
    expect(result).toContain("Hello world");
    expect(result).not.toContain("<h1>");
  });

  it("returns plain text as-is", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: async () => "plain text content",
    });

    const result = await webFetchTool.execute({ url: "https://example.com/file.txt", max_chars: undefined }, ctx);
    expect(result).toBe("plain text content");
  });

  it("truncates at max_chars", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: async () => "a".repeat(500),
    });

    const result = await webFetchTool.execute({ url: "https://example.com", max_chars: 100 }, ctx);
    expect(result).toContain("truncated at 100 chars");
  });

  it("handles HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await webFetchTool.execute({ url: "https://example.com/404", max_chars: undefined }, ctx);
    expect(result).toContain("[error]");
    expect(result).toContain("404");
  });

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await webFetchTool.execute({ url: "https://down.example.com", max_chars: undefined }, ctx);
    expect(result).toContain("[error]");
    expect(result).toContain("Connection refused");
  });

  it("returns [empty response] for empty content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/plain" }),
      text: async () => "",
    });

    const result = await webFetchTool.execute({ url: "https://example.com/empty", max_chars: undefined }, ctx);
    expect(result).toBe("[empty response]");
  });

  it("strips script and style tags from HTML", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html><script>alert('xss')</script><style>.x{}</style><p>content</p></html>",
    });

    const result = await webFetchTool.execute({ url: "https://example.com", max_chars: undefined }, ctx);
    expect(result).toContain("content");
    expect(result).not.toContain("alert");
    expect(result).not.toContain(".x{}");
  });
});

describe("web_search tool", () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it("parses DuckDuckGo results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <div class="result">
          <a class="result__a" href="https://example.com">Example Title</a>
          <a class="result__snippet">This is a snippet about the result</a>
        </div>
        <div class="result">
          <a class="result__a" href="https://other.com">Other Result</a>
          <a class="result__snippet">Another snippet here</a>
        </div>
      `,
    });

    const result = await webSearchTool.execute({ query: "test query", max_results: undefined }, ctx);
    expect(result).toContain("Example Title");
    expect(result).toContain("example.com");
    expect(result).toContain("snippet about the result");
    expect(result).toContain("Other Result");
  });

  it("handles no results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html><body>No results</body></html>",
    });

    const result = await webSearchTool.execute({ query: "xyznonexistent123", max_results: undefined }, ctx);
    expect(result).toContain("No results");
  });

  it("handles search errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const result = await webSearchTool.execute({ query: "test", max_results: undefined }, ctx);
    expect(result).toContain("[error]");
    expect(result).toContain("503");
  });

  it("respects max_results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <a class="result__a" href="https://a.com">A</a>
        <a class="result__snippet">Snippet A</a>
        <a class="result__a" href="https://b.com">B</a>
        <a class="result__snippet">Snippet B</a>
        <a class="result__a" href="https://c.com">C</a>
        <a class="result__snippet">Snippet C</a>
      `,
    });

    const result = await webSearchTool.execute({ query: "test", max_results: 2 }, ctx);
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).not.toContain("3.");
  });

  it("handles network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const result = await webSearchTool.execute({ query: "test", max_results: undefined }, ctx);
    expect(result).toContain("[error]");
    expect(result).toContain("Network timeout");
  });

  it("decodes DuckDuckGo redirect URLs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `
        <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example</a>
        <a class="result__snippet">A snippet</a>
      `,
    });

    const result = await webSearchTool.execute({ query: "test", max_results: undefined }, ctx);
    expect(result).toContain("https://example.com/page");
    expect(result).toContain("Example");
  });
});
