/**
 * Cron CLI — manage the miniclaw dispatch timer.
 *
 * Usage:
 *   miniclaw cron start [--interval N]   Install and start the dispatch timer (default: 15 min)
 *   miniclaw cron stop                   Uninstall the dispatch timer
 *   miniclaw cron status                 Show timer status and next scheduled run
 *   miniclaw cron run                    Trigger a dispatch cycle immediately
 *   miniclaw cron logs                   Tail dispatch logs
 */

import fs from "node:fs";
import { spawn } from "node:child_process";
import { ensureMinicawDirs, getMinicawHome, loadConfig } from "./config.js";
import { runDispatchCycle } from "./dispatch.js";
import {
  detectPlatform,
  getDispatchPaths,
  installDispatch,
  uninstallDispatch,
  dispatchStatus,
} from "./service.js";

function usage(): never {
  console.log(`
Cron — manage the miniclaw dispatch timer

Commands:
  start [--interval N]   Start the dispatch timer (default: 15 minutes)
  stop                   Stop the dispatch timer
  status                 Show timer status and next scheduled run
  run                    Trigger a dispatch cycle now (non-blocking)
  logs                   Tail dispatch logs

Platform: ${detectPlatform()} (${detectPlatform() === "macos" ? "launchd" : "systemd"})
`.trim());
  process.exit(1);
}

function parseInterval(args: string[]): number {
  const idx = args.indexOf("--interval");
  if (idx !== -1 && args[idx + 1]) {
    const interval = parseInt(args[idx + 1], 10);
    if (isNaN(interval) || interval < 1 || interval > 1440) {
      console.error("Invalid interval (must be 1–1440 minutes)");
      process.exit(1);
    }
    return interval;
  }
  return 15;
}

function handleStart(args: string[]): void {
  const interval = parseInterval(args);
  const home = getMinicawHome();
  const paths = getDispatchPaths(home);

  console.log(`Starting dispatch timer (${detectPlatform()})...`);
  console.log(`  Entrypoint: ${paths.entrypoint}`);
  console.log(`  Interval:   every ${interval} minutes`);
  console.log(`  Logs:       ${paths.logDir}`);

  installDispatch(home, interval);
  console.log("✓ Cron timer started.");
}

function handleStop(): void {
  console.log("Stopping dispatch timer...");
  uninstallDispatch();
  console.log("✓ Cron timer stopped.");
}

function handleStatus(): void {
  const status = dispatchStatus();

  if (status.running) {
    console.log(`Status:  running (PID ${status.pid})`);
  } else {
    console.log("Status:  stopped");
  }

  // Show last run time from most recent log file
  const home = getMinicawHome();
  const paths = getDispatchPaths(home);
  const logDir = paths.logDir;

  if (fs.existsSync(logDir)) {
    const logs = fs.readdirSync(logDir)
      .filter((f) => f.startsWith("dispatch-") && f.endsWith(".jsonl"))
      .sort();

    if (logs.length > 0) {
      const lastLog = logs[logs.length - 1];
      const mtime = fs.statSync(`${logDir}/${lastLog}`).mtime;
      console.log(`Last run: ${mtime.toLocaleString()}`);
    } else {
      console.log("Last run: never");
    }
  }
}

async function handleRun(): Promise<void> {
  console.log("Triggering dispatch cycle...");
  const config = loadConfig();
  await runDispatchCycle(config);
  console.log("✓ Dispatch cycle complete.");
}

function handleLogs(): void {
  const home = getMinicawHome();
  const paths = getDispatchPaths(home);
  const logFile = paths.stderrLog;

  if (!fs.existsSync(logFile)) {
    console.log(`No log file at ${logFile}`);
    process.exit(0);
  }

  console.log(`Tailing ${logFile} (Ctrl-C to stop)\n`);
  const tail = spawn("tail", ["-f", logFile], { stdio: "inherit" });
  tail.on("error", (err) => {
    console.error(`Failed to tail logs: ${err.message}`);
    process.exit(1);
  });
}

async function main() {
  ensureMinicawDirs();

  const [command, ...args] = process.argv.slice(2);

  if (!command) usage();

  switch (command) {
    case "start":  handleStart(args); break;
    case "stop":   handleStop(); break;
    case "status": handleStatus(); break;
    case "run":    await handleRun(); break;
    case "logs":   handleLogs(); break;
    default:       usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
