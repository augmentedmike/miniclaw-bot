/**
 * Dispatch CLI — manage the autonomous dispatch system.
 *
 * Usage:
 *   miniclaw-dispatch run                    Single dispatch cycle (what cron calls)
 *   miniclaw-dispatch status                 Show active locks + timer status
 *   miniclaw-dispatch logs [task-id]         Show recent audit logs
 *   miniclaw-dispatch install [--interval N] Install cron timer (default: 15 min)
 *   miniclaw-dispatch uninstall              Remove cron timer
 */

import fs from "node:fs";
import { ensureMinicawDirs, getMinicawHome, loadConfig } from "./config.js";
import { runDispatchCycle, getActiveLocks, getAuditLogs } from "./dispatch.js";
import {
  detectPlatform,
  getDispatchPaths,
  installDispatch,
  uninstallDispatch,
  dispatchStatus,
} from "./service.js";

function usage(): never {
  console.log(`
Dispatch — autonomous agent dispatch system

Commands:
  run                    Run a single dispatch cycle
  status                 Show active locks and timer status
  logs [task-id]         Show recent audit logs (all or for one task)
  install [--interval N] Install dispatch timer (default: 15 minutes)
  uninstall              Remove dispatch timer

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

async function handleRun(): Promise<void> {
  const config = loadConfig();
  await runDispatchCycle(config);
}

function handleStatus(): void {
  const locks = getActiveLocks();
  const timer = dispatchStatus();

  console.log(`Timer: ${timer.running ? "active" : "not running"}`);
  console.log(`Active agents: ${locks.length}`);

  if (locks.length > 0) {
    for (const lock of locks) {
      console.log(`  Task #${lock.taskId} — PID ${lock.pid}, started ${lock.startedAt}`);
    }
  }
}

function handleLogs(args: string[]): void {
  const taskId = args[0] ? parseInt(args[0], 10) : undefined;
  if (args[0] && (taskId === undefined || isNaN(taskId))) {
    console.error("Invalid task ID");
    process.exit(1);
  }

  const logFiles = getAuditLogs(taskId);
  if (logFiles.length === 0) {
    console.log(taskId !== undefined ? `No logs for task #${taskId}.` : "No dispatch logs.");
    return;
  }

  // Show last 5 log files, last 50 lines each
  const recent = logFiles.slice(-5);
  for (const logFile of recent) {
    console.log(`\n─── ${logFile} ───`);
    try {
      const content = fs.readFileSync(logFile, "utf8");
      const lines = content.trim().split("\n").slice(-50);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { at: string; level: string; message: string };
          const levelTag = entry.level === "error" ? "ERR" : entry.level === "warn" ? "WRN" : "INF";
          console.log(`  [${levelTag}] ${entry.at} ${entry.message}`);
        } catch {
          console.log(`  ${line}`);
        }
      }
    } catch (err) {
      console.error(`  Failed to read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function handleInstall(args: string[]): void {
  const interval = parseInterval(args);
  const home = getMinicawHome();
  const paths = getDispatchPaths(home);

  console.log(`Installing dispatch timer (${detectPlatform()})...`);
  console.log(`  Home:       ${home}`);
  console.log(`  Entrypoint: ${paths.entrypoint}`);
  console.log(`  Interval:   ${interval} minutes`);
  console.log(`  Logs:       ${paths.logDir}`);

  installDispatch(home, interval);
  console.log("Dispatch timer installed.");
}

function handleUninstall(): void {
  console.log("Uninstalling dispatch timer...");
  uninstallDispatch();
  console.log("Dispatch timer removed.");
}

async function main() {
  ensureMinicawDirs();

  const [command, ...args] = process.argv.slice(2);

  if (!command) usage();

  switch (command) {
    case "run":       await handleRun(); break;
    case "status":    handleStatus(); break;
    case "logs":      handleLogs(args); break;
    case "install":   handleInstall(args); break;
    case "uninstall": handleUninstall(); break;
    default:          usage();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
