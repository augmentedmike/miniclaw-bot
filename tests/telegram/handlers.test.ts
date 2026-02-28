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

// Mock send module
vi.mock("@telegram/send.js", () => ({
  sendResponse: vi.fn(async () => {}),
}));

// Mock access module — default to owner already claimed with user 999
vi.mock("@telegram/access.js", () => ({
  loadAccess: vi.fn(() => ({
    ownerId: 999,
    ownerUsername: "testowner",
    allowedUsers: [999],
    pendingUsers: [],
  })),
  claimOwner: vi.fn((_id: number, _u: string | null) => ({
    ownerId: 999,
    ownerUsername: "testowner",
    allowedUsers: [999],
    pendingUsers: [],
  })),
  isAllowed: vi.fn((_state: unknown, userId: number) => userId === 999),
  isPending: vi.fn(() => false),
  addPending: vi.fn((state: unknown) => state),
  approveUser: vi.fn((state: unknown) => state),
  denyUser: vi.fn((state: unknown) => state),
}));

function makeCtx(overrides?: { text?: string; chatId?: number; userId?: number; username?: string; messageId?: number }) {
  const userId = overrides?.userId ?? 999;
  return {
    message: { text: overrides?.text ?? "hello", message_id: overrides?.messageId ?? 42 },
    chat: { id: overrides?.chatId ?? 123 },
    from: { id: userId, username: overrides?.username ?? "testowner" },
    api: { sendChatAction: vi.fn(async () => true) },
  };
}

describe("telegram handlers", () => {
  let registeredHandlers: Record<string, (ctx: unknown) => Promise<void>>;
  let mockBot: {
    on: ReturnType<typeof vi.fn>;
    api: { sendMessage: ReturnType<typeof vi.fn>; sendChatAction: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers = {};
    mockBot = {
      on: vi.fn((event: string, handler: (ctx: unknown) => Promise<void>) => {
        registeredHandlers[event] = handler;
      }),
      api: {
        sendMessage: vi.fn(async () => ({ message_id: 1 })),
        sendChatAction: vi.fn(async () => true),
      },
    };
  });

  it("registers message:text and callback_query:data handlers", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });
    expect(mockBot.on).toHaveBeenCalledWith("callback_query:data", expect.any(Function));
    expect(mockBot.on).toHaveBeenCalledWith("message:text", expect.any(Function));
    expect(registeredHandlers["message:text"]).not.toBeUndefined();
  });

  it("calls runAgent with channel telegram and sends response", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { sendResponse } = await import("@telegram/send.js");
    const { runAgent } = await import("@src/agent.js");

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    await registeredHandlers["message:text"]!(makeCtx());

    expect(runAgent).toHaveBeenCalledWith(
      [{ role: "user", content: "hello" }],
      expect.any(Object),
      expect.objectContaining({ channel: "telegram", userId: "default" }),
    );
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

    const ctx = makeCtx();
    await registeredHandlers["message:text"]!(ctx);

    expect(ctx.api.sendChatAction).toHaveBeenCalledWith(123, "typing");
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

    await registeredHandlers["message:text"]!(makeCtx());

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

    await registeredHandlers["message:text"]!(makeCtx());

    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining("LLM failed"),
      expect.objectContaining({ reply_to_message_id: 42 }),
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

    await registeredHandlers["message:text"]!(makeCtx());

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

    await registeredHandlers["message:text"]!(makeCtx());

    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining("string error"),
      expect.objectContaining({ reply_to_message_id: 42 }),
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

    await registeredHandlers["message:text"]!(makeCtx());

    expect(mockBot.api.sendMessage).toHaveBeenCalled();
  });

  it("blocks unapproved users and notifies owner", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { addPending } = await import("@telegram/access.js");

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    // User 555 is not allowed (isAllowed mock returns false for non-999)
    await registeredHandlers["message:text"]!(makeCtx({ userId: 555, username: "stranger" }));

    expect(addPending).toHaveBeenCalled();
    // Should notify owner with approve/deny buttons
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(
      999,
      expect.stringContaining("stranger"),
      expect.objectContaining({ reply_markup: expect.any(Object) }),
    );
    // Should tell the user their request is pending
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(
      123,
      "Access requested. The bot owner has been notified.",
      expect.objectContaining({ reply_to_message_id: 42 }),
    );
  });

  it("claims ownership on first message when no owner set", async () => {
    const { registerHandlers } = await import("@telegram/handlers.js");
    const { loadAccess, claimOwner, isAllowed } = await import("@telegram/access.js");

    // No owner yet
    (loadAccess as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      ownerId: null,
      ownerUsername: null,
      allowedUsers: [],
      pendingUsers: [],
    });
    // After claiming, user is allowed
    (isAllowed as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);

    registerHandlers(mockBot as any, {
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
    });

    await registeredHandlers["message:text"]!(makeCtx({ userId: 777, username: "newowner" }));

    expect(claimOwner).toHaveBeenCalledWith(777, "newowner");
    expect(mockBot.api.sendMessage).toHaveBeenCalledWith(
      123,
      "You are now the owner of this bot.",
      expect.objectContaining({ reply_to_message_id: 42 }),
    );
  });
});
