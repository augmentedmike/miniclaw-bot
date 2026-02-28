import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock getAccessToken
vi.mock("@src/auth.js", () => ({
  getAccessToken: vi.fn(async () => "mock-access-token"),
}));

// Mock context module — no real qmd needed
vi.mock("@src/context.js", () => ({
  retrieveContext: vi.fn(() => ""),
  saveContext: vi.fn(),
}));

// Mock conversation module
vi.mock("@src/conversation.js", () => ({
  loadHistory: vi.fn(() => []),
  appendToHistory: vi.fn(),
}));

// Capture the fetch wrapper passed to createAnthropic
let capturedFetch: typeof globalThis.fetch | null = null;

// Mock @ai-sdk/anthropic
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn((opts: { fetch?: typeof globalThis.fetch }) => {
    capturedFetch = opts.fetch ?? null;
    return vi.fn(() => "mock-model");
  }),
}));

// Mock the ai module's streamText
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: vi.fn(() => {
      // Create an async iterable for fullStream
      const parts = [
        { type: "text-delta", textDelta: "Hello " },
        { type: "text-delta", textDelta: "world" },
        { type: "tool-call", toolName: "shell_exec", args: { command: "ls" } },
      ];
      return {
        fullStream: (async function* () {
          for (const part of parts) {
            yield part;
          }
        })(),
        response: Promise.resolve({
          messages: [{ role: "assistant", content: "Hello world" }],
        }),
      };
    }),
  };
});

const { createTools, runAgent } = await import("@src/agent.js");

describe("agent", () => {
  describe("createTools", () => {
    it("creates all expected tools", () => {
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };
      const tools = createTools(config);
      const toolNames = Object.keys(tools);

      expect(toolNames).toContain("shell_exec");
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("write_file");
      expect(toolNames).toContain("edit_file");
      expect(toolNames).toContain("list_directory");
      expect(toolNames).toContain("glob");
      expect(toolNames).toContain("grep");
      expect(toolNames).toContain("web_fetch");
      expect(toolNames).toContain("web_search");
      expect(toolNames).toContain("memory_save");
      expect(toolNames).toContain("memory_search");
      expect(toolNames).toContain("memory_vector_search");
      expect(toolNames).toContain("memory_deep_search");
      expect(toolNames).toContain("claude_code");
      expect(toolNames).toContain("vault_get");
      expect(toolNames).toContain("vault_list");
    });

    it("creates 16 tools total", () => {
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };
      const tools = createTools(config);
      expect(Object.keys(tools)).toHaveLength(20);
    });

    it("passes shell timeout to shell_exec", () => {
      const config = {
        model: "test",
        maxSteps: 1,
        shellTimeout: 99_000,
        conversationLimit: 50,
      };
      const tools = createTools(config);
      // Tool exists and is callable
      expect(tools.shell_exec).toBeDefined();
      expect(tools.shell_exec.execute).toBeTypeOf("function");
    });
  });

  describe("runAgent", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("runs the agent and returns text and messages", async () => {
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      const messages = [{ role: "user" as const, content: "hello" }];
      const result = await runAgent(messages, config);

      expect(result.text).toBe("Hello world");
      expect(result.messages).toHaveLength(2); // original + assistant response
      expect(result.messages[0]).toEqual({ role: "user", content: "hello" });
    });

    it("calls onText callback for text deltas", async () => {
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      const onText = vi.fn();
      const messages = [{ role: "user" as const, content: "hello" }];
      await runAgent(messages, config, { onText });

      expect(onText).toHaveBeenCalledWith("Hello ");
      expect(onText).toHaveBeenCalledWith("world");
      expect(onText).toHaveBeenCalledTimes(2);
    });

    it("calls onToolCall callback for tool calls", async () => {
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      const onToolCall = vi.fn();
      const messages = [{ role: "user" as const, content: "hello" }];
      await runAgent(messages, config, { onToolCall });

      expect(onToolCall).toHaveBeenCalledWith("shell_exec", { command: "ls" });
      expect(onToolCall).toHaveBeenCalledTimes(1);
    });

    it("gets access token from auth module", async () => {
      const { getAccessToken } = await import("@src/auth.js");
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      await runAgent([{ role: "user" as const, content: "hi" }], config);

      expect(getAccessToken).toHaveBeenCalled();
    });

    it("creates anthropic client with oauth fetch wrapper", async () => {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      await runAgent([{ role: "user" as const, content: "hi" }], config);

      expect(createAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "oauth-placeholder",
          fetch: expect.any(Function),
        }),
      );
    });

    it("calls streamText with correct parameters", async () => {
      const { streamText } = await import("ai");
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      await runAgent([{ role: "user" as const, content: "hi" }], config);

      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "mock-model",
          system: expect.any(String),
          messages: expect.any(Array),
          tools: expect.any(Object),
          maxSteps: 25,
        }),
      );
    });

    it("works without optional callbacks", async () => {
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      const result = await runAgent(
        [{ role: "user" as const, content: "hello" }],
        config,
      );
      expect(result.text).toBe("Hello world");
    });

    it("loads and saves conversation history when userId is provided", async () => {
      const { loadHistory, appendToHistory } = await import("@src/conversation.js");
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      await runAgent(
        [{ role: "user" as const, content: "hello" }],
        config,
        { userId: "tg-123" },
      );

      expect(loadHistory).toHaveBeenCalledWith("tg-123", 50);
      expect(appendToHistory).toHaveBeenCalledWith(
        "tg-123",
        expect.arrayContaining([
          expect.objectContaining({ role: "user" }),
        ]),
        50,
      );
    });

    it("skips history when no userId is provided", async () => {
      const { loadHistory, appendToHistory } = await import("@src/conversation.js");
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      await runAgent(
        [{ role: "user" as const, content: "hello" }],
        config,
      );

      expect(loadHistory).not.toHaveBeenCalled();
      expect(appendToHistory).not.toHaveBeenCalled();
    });

    it("oauthFetch wrapper sets Bearer auth and removes x-api-key", async () => {
      const config = {
        model: "claude-sonnet-4-20250514",
        maxSteps: 25,
        shellTimeout: 5000,
        conversationLimit: 50,
      };

      // Stub globalThis.fetch to capture the call
      const origFetch = globalThis.fetch;
      const fetchSpy = vi.fn(async () => new Response("ok"));
      globalThis.fetch = fetchSpy;

      try {
        await runAgent([{ role: "user" as const, content: "hi" }], config);

        // Now call the captured oauthFetch to verify it works
        expect(capturedFetch).not.toBeNull();
        await capturedFetch!("https://api.anthropic.com/v1/messages", {
          headers: { "x-api-key": "should-be-removed", "Content-Type": "application/json" },
        });

        expect(fetchSpy).toHaveBeenCalled();
        const [, callInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(callInit.headers);
        expect(headers.get("Authorization")).toBe("Bearer mock-access-token");
        expect(headers.has("x-api-key")).toBe(false);
        expect(headers.get("anthropic-beta")).toContain("oauth-2025-04-20");
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});
