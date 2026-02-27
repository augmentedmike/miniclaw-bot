import { loadConfig, ensureMinicawDirs } from "./config.js";
import { runAgent } from "./agent.js";

async function main() {
  ensureMinicawDirs();
  const config = loadConfig();

  const args = process.argv.slice(2);
  const messageIndex = args.indexOf("--message");

  if (messageIndex !== -1) {
    // CLI one-shot mode
    const message = args.slice(messageIndex + 1).join(" ");
    if (!message) {
      console.error("Usage: miniclaw --message <your message>");
      process.exit(1);
    }
    await runCli(message, config);
  } else if (config.telegramBotToken) {
    // Telegram bot mode
    await startTelegram(config);
  } else {
    console.error(
      "No mode specified. Either:\n" +
      "  1. Pass --message 'your message' for CLI mode\n" +
      "  2. Set TELEGRAM_BOT_TOKEN in .env for Telegram mode",
    );
    process.exit(1);
  }
}

async function runCli(message: string, config: ReturnType<typeof loadConfig>) {
  console.log(`> ${message}\n`);

  try {
    const result = await runAgent(
      [{ role: "user", content: message }],
      config,
      {
        onText: (text) => process.stdout.write(text),
        onToolCall: (name, args) => {
          console.log(`\n[tool: ${name}]`, JSON.stringify(args, null, 2));
        },
      },
    );
    console.log(); // final newline
  } catch (err) {
    console.error("\nAgent error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

async function startTelegram(config: ReturnType<typeof loadConfig>) {
  // Dynamic import to avoid loading Grammy unless needed
  const { startBot } = await import("./telegram/bot.js");
  await startBot(config);
}

// Graceful shutdown
function setupShutdown() {
  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

setupShutdown();
main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
