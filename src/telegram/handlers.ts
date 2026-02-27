import type { Bot } from "grammy";
import { runAgent } from "../agent.js";
import { sendResponse } from "./send.js";
import { loadHistory, saveHistory } from "../conversation.js";
import type { MinicawConfig } from "../types.js";

export function registerHandlers(bot: Bot, config: MinicawConfig): void {
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;

    // Send "typing" indicator while processing
    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(chatId, "typing").catch(() => {});
    }, 4000);
    ctx.api.sendChatAction(chatId, "typing").catch(() => {});

    try {
      // Load conversation history and append new user message
      const history = loadHistory(config.conversationLimit);
      const messages = [...history, { role: "user" as const, content: text }];

      const result = await runAgent(messages, config);

      clearInterval(typingInterval);

      // Save updated history
      saveHistory(result.messages, config.conversationLimit);

      if (result.text) {
        await sendResponse(bot, chatId, result.text, messageId);
      } else {
        await bot.api.sendMessage(chatId, "(no response)", {
          reply_to_message_id: messageId,
        });
      }
    } catch (err) {
      clearInterval(typingInterval);
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Agent error:", errMsg);
      try {
        await bot.api.sendMessage(chatId, `Error: ${errMsg}`, {
          reply_to_message_id: messageId,
        });
      } catch {
        // Best effort
      }
    }
  });
}
