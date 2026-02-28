import type { Bot } from "grammy";
import { runAgent } from "../agent.js";
import { sendResponse } from "./send.js";
import type { MinicawConfig } from "../types.js";
import {
  loadAccess,
  claimOwner,
  isAllowed,
  isPending,
  addPending,
  approveUser,
  denyUser,
} from "./access.js";

export function registerHandlers(bot: Bot, config: MinicawConfig): void {
  // Callback queries for approve/deny buttons
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const fromId = ctx.from.id;
    const state = loadAccess();

    // Only the owner can approve/deny
    if (fromId !== state.ownerId) {
      await ctx.answerCallbackQuery({ text: "Only the owner can do this." });
      return;
    }

    if (data.startsWith("approve:")) {
      const userId = parseInt(data.slice("approve:".length), 10);
      approveUser(state, userId);
      await ctx.answerCallbackQuery({ text: "User approved." });
      await ctx.editMessageText(`Approved user ${userId}.`);
      // Notify the approved user
      try {
        await bot.api.sendMessage(userId, "You've been approved. You can now use this bot.");
      } catch { /* user may have blocked bot */ }
    } else if (data.startsWith("deny:")) {
      const userId = parseInt(data.slice("deny:".length), 10);
      denyUser(state, userId);
      await ctx.answerCallbackQuery({ text: "User denied." });
      await ctx.editMessageText(`Denied user ${userId}.`);
    }
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const username = ctx.from.username ?? null;
    const messageId = ctx.message.message_id;

    let state = loadAccess();

    // First user claims ownership
    if (state.ownerId === null) {
      state = claimOwner(userId, username);
      console.log(`Owner claimed: ${username ?? userId}`);
      await bot.api.sendMessage(chatId, "You are now the owner of this bot.", {
        reply_to_message_id: messageId,
      });
      // Fall through to handle the message normally
    }

    // Gate: only allowed users can interact
    if (!isAllowed(state, userId)) {
      if (!isPending(state, userId)) {
        addPending(state, userId, username);
        // Notify owner
        try {
          await bot.api.sendMessage(state.ownerId!, `Access request from @${username ?? "unknown"} (${userId})`, {
            reply_markup: {
              inline_keyboard: [[
                { text: "Approve", callback_data: `approve:${userId}` },
                { text: "Deny", callback_data: `deny:${userId}` },
              ]],
            },
          });
        } catch { /* owner may have blocked bot */ }
        await bot.api.sendMessage(chatId, "Access requested. The bot owner has been notified.", {
          reply_to_message_id: messageId,
        });
      } else {
        await bot.api.sendMessage(chatId, "Your access request is pending owner approval.", {
          reply_to_message_id: messageId,
        });
      }
      return;
    }

    // Send "typing" indicator while processing
    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(chatId, "typing").catch(() => {});
    }, 4000);
    ctx.api.sendChatAction(chatId, "typing").catch(() => {});

    try {
      // Each message is standalone — KB provides coherence
      const messages = [{ role: "user" as const, content: text }];

      const result = await runAgent(messages, config, { channel: "telegram", userId: "default" });

      clearInterval(typingInterval);

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
