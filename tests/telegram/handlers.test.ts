import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the agent module
vi.mock("@src/agent.js", () => ({
  runAgent: vi.fn(async () => ({
    text: "Test response from agent",
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "Test response from agent" },
    ],
  })),
}));

// Mock conversation module
vi.mock("@src/conversation.js", () => ({
  loadHistory: vi.fn(() => []),
  saveHistory: vi.fn(),
}));

// Mock send module
vi.mock("@telegram/send.js", () => ({
  sendResponse: vi.fn(async () => {}),
}));

describe("telegram handlers", () => {
  let registeredHandler: ((ctx: unknown) => Promise<void>) | null = null;
  let mockBot: {
    on: ReturnType<typeof vi.fn>;
    api: { sendMessage: ReturnType<typeof vi.fn>; sendChatAction: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandler = null;
    mockBot = {
      on: vi.fn((event: string, handler: (ctx: unknown) => Promise<void>) => {
        if (event === "message:text") {
          registeredHandler = handler;
        }
      }),
      api: {
        sendMessage: vi.fn(async () => ({ message_id: 1 })),
        sendChatAction: vi.fn(async () => true),
      },
    };
  });

  it("registers a message:text handler", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });
    expect(mockBot.on).toHaveBeenCalledWith("message:text", expect.any(Function));
    expect(registeredHandler).not.toBeNull();
  });

  it("calls runAgent and sends response", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { sendResponse } = await import("@telegram/send.js");
    const { runAgent } = await import("@src/agent.js");

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    // Simulate a message
    const ctx = {
      message: { text: "hello", message_id: 42 },
      chat: { id: 123 },
      api: { sendChatAction: vi.fn(async () => true) },
    };

    await registeredHandler!(ctx);

    expect(runAgent).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith(
      mockBot,
      123,
      "Test response from agent",
      42,
    );
  });

  it("sends typing indicator and clears interval on success", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const { registerHandlers } = await import("@telegram/handlers.js");

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    const ctx = {
      message: { text: "hello", message_id: 1 },
      chat: { id: 123 },
      api: { sendChatAction: vi.fn(async () => true) },
    };

    await registeredHandler!(ctx);

    // Should have called sendChatAction with "typing"
    expect(ctx.api.sendChatAction).toHaveBeenCalledWith(123, "typing");
    // Should have cleared the typing interval
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("sends '(no response)' when agent returns empty text", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { runAgent } = await import("@src/agent.js");

    (runAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: "",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "" },
      ],
    });

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    const ctx = {
      message: { text: "hello", message_id: 42 },
      chat: { id: 123 },
      api: { sendChatAction: vi.fn(async () => true) },
    };

    await registeredHandler!(ctx);

    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(
      123,
      "(no response)",
      expect.objectContaining({ reply_to_message_id: 42 }),
    );
  });

  it("handles agent errors gracefully", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { runAgent } = await import("@src/agent.js");

    (runAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("LLM failed"));

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    const ctx = {
      message: { text: "hello", message_id: 1 },
      chat: { id: 123 },
      api: { sendChatAction: vi.fn(async () => true) },
    };

    // Should not throw
    await registeredHandler!(ctx);

    // Should send error message back
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining("LLM failed"),
      expect.objectContaining({ reply_to_message_id: 1 }),
    );
  });

  it("clears typing interval on error path", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { runAgent } = await import("@src/agent.js");

    (runAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("fail"));

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    const ctx = {
      message: { text: "hello", message_id: 1 },
      chat: { id: 123 },
      api: { sendChatAction: vi.fn(async () => true) },
    };

    await registeredHandler!(ctx);

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("handles non-Error exceptions in the catch block", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { runAgent } = await import("@src/agent.js");

    (runAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce("string error");

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    const ctx = {
      message: { text: "hello", message_id: 1 },
      chat: { id: 123 },
      api: { sendChatAction: vi.fn(async () => true) },
    };

    await registeredHandler!(ctx);

    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining("string error"),
      expect.objectContaining({ reply_to_message_id: 1 }),
    );
  });

  it("silently catches error when sending error message fails", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { runAgent } = await import("@src/agent.js");

    (runAgent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("agent failed"));
    mockBot.api.sendMessage.mockRejectedValueOnce(new Error("telegram down"));

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    const ctx = {
      message: { text: "hello", message_id: 1 },
      chat: { id: 123 },
      api: { sendChatAction: vi.fn(async () => true) },
    };

    // Should not throw even though sendMessage fails
    await registeredHandler!(ctx);

    expect(mockBot.api.sendMessage).toHaveBeenCalled();
  });
});
