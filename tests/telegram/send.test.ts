import { describe, expect, it, vi } from "vitest";
import { sendResponse } from "@telegram/send.js";

describe("sendResponse", () => {
  function mockBot(sendResults: Array<{ ok: boolean; error?: string }> = []) {
    let callIndex = 0;
    return {
      api: {
        sendMessage: vi.fn(async (_chatId: number, text: string, _opts?: unknown) => {
          const result = sendResults[callIndex] ?? { ok: true };
          callIndex++;
          if (!result.ok) {
            throw new Error(result.error ?? "send failed");
          }
          return { message_id: callIndex };
        }),
      },
    };
  }

  it("sends a short message as HTML", async () => {
    const bot = mockBot();
    await sendResponse(bot as any, 123, "**bold** text", 1);
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining("<b>bold</b>"),
      expect.objectContaining({ parse_mode: "HTML", reply_to_message_id: 1 }),
    );
  });

  it("chunks long messages", async () => {
    const bot = mockBot();
    const longText = "word ".repeat(2000); // ~10000 chars
    await sendResponse(bot as any, 123, longText);
    expect(bot.api.sendMessage.mock.calls.length).toBeGreaterThan(1);
  });

  it("falls back to plain text on HTML parse error", async () => {
    const bot = mockBot([
      { ok: false, error: "Bad Request: can't parse entities" },
      { ok: true },
    ]);
    await sendResponse(bot as any, 123, "some text");
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(2);
    // Second call should not have parse_mode
    const secondCall = bot.api.sendMessage.mock.calls[1];
    expect(secondCall?.[2]).not.toHaveProperty("parse_mode");
  });

  it("rethrows non-parse errors", async () => {
    const bot = mockBot([{ ok: false, error: "Network timeout" }]);
    await expect(sendResponse(bot as any, 123, "text")).rejects.toThrow("Network timeout");
  });

  it("only sets reply_to_message_id on first chunk", async () => {
    const bot = mockBot();
    const longText = "x".repeat(5000);
    await sendResponse(bot as any, 123, longText, 42);
    const calls = bot.api.sendMessage.mock.calls;
    expect(calls[0]?.[2]).toHaveProperty("reply_to_message_id", 42);
    if (calls.length > 1) {
      expect(calls[1]?.[2]).not.toHaveProperty("reply_to_message_id");
    }
  });
});
