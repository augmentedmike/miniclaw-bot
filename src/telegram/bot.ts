import { Bot } from "grammy";
import { run } from "@grammyjs/runner";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { registerHandlers } from "./handlers.js";
import type { MinicawConfig } from "../types.js";

export async function startBot(config: MinicawConfig): Promise<void> {
  const token = config.telegramBotToken;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  const bot = new Bot(token);

  // Rate limit outgoing API calls
  bot.api.config.use(apiThrottler());

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err.message ?? err);
  });

  // Register message handlers
  registerHandlers(bot, config);

  // Get bot info for logging
  const me = await bot.api.getMe();
  console.log(`Telegram bot started: @${me.username} (${me.first_name})`);
  console.log("Listening for messages...");

  // Start polling with grammyjs/runner
  const runner = run(bot, {
    runner: {
      fetch: {
        allowed_updates: ["message", "callback_query"],
      },
    },
  });

  // Handle graceful shutdown
  const stop = () => {
    console.log("\nStopping Telegram bot...");
    runner.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  // Wait for runner to finish
  await runner.task();
  console.log("Telegram bot stopped.");
}
