import path from "node:path";
import { loadConfig, ensureMinicawDirs } from "./config.js";
import { runAgent } from "./agent.js";

async function main() {
  ensureMinicawDirs();
  const config = loadConfig();

  const args = process.argv.slice(2);
  const messageIndex = args.indexOf("--message");

  // Check for a directory argument (e.g. `miniclaw .` or `miniclaw /some/path`)
  // A positional arg that isn't a flag and isn't the value after --message becomes the jail.
  const dirArg = args.find((a, i) => !a.startsWith("-") && !(messageIndex !== -1 && i === messageIndex + 1));
  if (dirArg) {
    const resolved = path.resolve(dirArg);
    const fs = await import("node:fs");
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      config.jailDir = resolved;
    }
  }

  // If no explicit jail, jail to cwd
  if (!config.jailDir) {
    config.jailDir = process.cwd();
  }

  console.error(`jailed to ${config.jailDir}`);

  if (args[0] === "setup") {
    const { runSetup } = await import("./setup.js");
    await runSetup();
    return;
  }

  if (args[0] === "service") {
    const { spawn } = await import("node:child_process");
    const serviceCli = new URL("./service-cli.mjs", import.meta.url).pathname;
    const child = spawn(process.execPath, [serviceCli, ...args.slice(1)], { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  if (args[0] === "serve") {
    const { startWebServer } = await import("./web/server.js");
    await startWebServer(config);
    // Also start telegram bot if token is configured (non-fatal — don't crash the web server)
    if (config.telegramBotToken) {
      startTelegram(config).catch((err) => {
        console.error("Telegram bot failed to start (web server still running):", err instanceof Error ? err.message : err);
      });
    }
    return;
  }

  if (messageIndex !== -1) {
    // CLI one-shot mode
    const message = args.slice(messageIndex + 1).join(" ");
    if (!message) {
      console.error("Usage: miniclaw [dir] --message <your message>");
      process.exit(1);
    }
    await runCli(message, config);
  } else if (config.telegramBotToken) {
    // Telegram bot mode
    await startTelegram(config);
  } else {
    console.error(
      "Usage:\n" +
      "  miniclaw --message 'your message'         One-shot (jailed to cwd)\n" +
      "  miniclaw /path --message 'your message'    One-shot (jailed to /path)\n" +
      "  miniclaw serve                             Web chat UI on :3000\n" +
      "  Set TELEGRAM_BOT_TOKEN in .env              Telegram bot mode",
    );
    process.exit(1);
  }
}

async function runCli(message: string, config: ReturnType<typeof loadConfig>) {
  try {
    await runAgent(
      [{ role: "user", content: message }],
      config,
      {
        channel: "cli",
        userId: "default",
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
