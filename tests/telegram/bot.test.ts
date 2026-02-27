import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

let mockStopFn: ReturnType<typeof vi.fn>;
let mockCatchHandler: ((err: { message?: string }) => void) | null = null;

// Mock grammy and runner to test bot setup without actually connecting
vi.mock("grammy", () => {
  const mockApi = {
    sendMessage: vi.fn(),
    sendChatAction: vi.fn(),
    getMe: vi.fn(async () => ({ username: "test_bot", first_name: "Test" })),
    config: { use: vi.fn() },
  };
  return {
    Bot: vi.fn(() => ({
      api: mockApi,
      catch: vi.fn((handler: (err: { message?: string }) => void) => {
        mockCatchHandler = handler;
      }),
      on: vi.fn(),
      use: vi.fn(),
    })),
  };
});

vi.mock("@grammyjs/runner", () => {
  mockStopFn = vi.fn();
  return {
    run: vi.fn(() => ({
      stop: mockStopFn,
      task: vi.fn(async () => {}),
    })),
  };
});

vi.mock("@grammyjs/transformer-throttler", () => ({
  apiThrottler: vi.fn(() => vi.fn()),
}));

describe("telegram bot", () => {
  afterEach(() => {
    mockCatchHandler = null;
    // Remove our signal listeners to avoid test interference
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
  });

  it("creates bot with token and starts polling", async () => {
    const { Bot } = await import("grammy");
    const { run } = await import("@grammyjs/runner");
    const { apiThrottler } = await import("@grammyjs/transformer-throttler");
    const { startBot } = await import("@telegram/bot.js");

    await startBot({
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
      telegramBotToken: "123:ABC",
    });

    expect(Bot).toHaveBeenCalledWith("123:ABC");
    expect(apiThrottler).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  it("throws when no token provided", async () => {
    const { startBot } = await import("@telegram/bot.js");
    await expect(
      startBot({
        model: "test",
        maxSteps: 1,
        shellTimeout: 5000,
        conversationLimit: 50,
      }),
    ).rejects.toThrow("TELEGRAM_BOT_TOKEN not set");
  });

  it("registers error handler via bot.catch", async () => {
    const { startBot } = await import("@telegram/bot.js");

    await startBot({
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
      telegramBotToken: "123:TOKEN",
    });

    expect(mockCatchHandler).not.toBeNull();

    // Test that the error handler logs without throwing
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCatchHandler!({ message: "test bot error" });
    expect(consoleSpy).toHaveBeenCalledWith("Bot error:", "test bot error");
    consoleSpy.mockRestore();
  });

  it("registers SIGINT/SIGTERM handlers that stop the runner", async () => {
    const { startBot } = await import("@telegram/bot.js");

    await startBot({
      model: "test",
      maxSteps: 1,
      shellTimeout: 5000,
      conversationLimit: 50,
      telegramBotToken: "123:SIGNAL_TEST",
    });

    // The stop function from the runner mock should be called when we emit SIGINT
    mockStopFn.mockClear();
    process.emit("SIGINT");
    expect(mockStopFn).toHaveBeenCalled();
  });
});
