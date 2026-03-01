/**
 * Webdebug CLI — run the miniclaw web server in debug mode.
 *
 * Usage:
 *   miniclaw webdebug start [--port N]   Start web server with verbose debug output
 *   miniclaw webdebug stop               Stop the debug server
 *   miniclaw webdebug status             Show debug server status
 *   miniclaw webdebug logs               Tail debug server logs
 *   miniclaw webdebug attach             Attach to running debug server output (live)
 */

import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { ensureMinicawDirs, getMinicawHome } from "./config.js";

const WEBDEBUG_LABEL = "com.miniclaw.webdebug";
const WEBDEBUG_PID_FILE = () => path.join(getMinicawHome(), "run", "webdebug.pid");
const WEBDEBUG_LOG_FILE = () => path.join(getMinicawHome(), "logs", "webdebug.log");
const DEFAULT_DEBUG_PORT = 4205;

function usage(): never {
  console.log(`
Webdebug — miniclaw web server in debug mode

Commands:
  start [--port N]   Start debug server (default port: ${DEFAULT_DEBUG_PORT})
  stop               Stop the debug server
  status             Show debug server status
  logs               Tail debug server logs
  attach             Stream live debug server output (Ctrl-C to detach)

Debug mode enables:
  • Verbose request/response logging
  • Tool call tracing
  • Agent reasoning output
  • Hot-reload on file changes (if tsx available)
`.trim());
  process.exit(1);
}

function parsePort(args: string[]): number {
  const idx = args.indexOf("--port");
  if (idx !== -1 && args[idx + 1]) {
    const port = parseInt(args[idx + 1], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error("Invalid port number");
      process.exit(1);
    }
    return port;
  }
  return DEFAULT_DEBUG_PORT;
}

function readPid(): number | null {
  const pidFile = WEBDEBUG_PID_FILE();
  if (!fs.existsSync(pidFile)) return null;
  const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
  if (isNaN(pid)) return null;
  // Check if process is alive
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    fs.unlinkSync(pidFile);
    return null;
  }
}

function writePid(pid: number): void {
  const runDir = path.join(getMinicawHome(), "run");
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(WEBDEBUG_PID_FILE(), String(pid), "utf8");
}

function handleStart(args: string[]): void {
  const existingPid = readPid();
  if (existingPid !== null) {
    console.log(`Debug server already running (PID ${existingPid}). Use 'stop' first.`);
    process.exit(1);
  }

  const port = parsePort(args);
  const home = getMinicawHome();
  const entrypoint = path.join(home, "system", "lib", "miniclaw.mjs");
  const logFile = WEBDEBUG_LOG_FILE();

  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  console.log(`Starting debug server on port ${port}...`);
  console.log(`  Logs: ${logFile}`);

  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  const child = spawn(process.execPath, [entrypoint, "serve"], {
    detached: true,
    stdio: ["ignore", out, err],
    env: {
      ...process.env,
      PORT: String(port),
      DEBUG: "miniclaw:*",
      MINICLAW_VERBOSE: "1",
      MINICLAW_TRACE_TOOLS: "1",
      MINICLAW_HOME: home,
    },
  });

  child.unref();
  writePid(child.pid!);

  console.log(`✓ Debug server started (PID ${child.pid}) on http://localhost:${port}`);
  console.log(`  Run 'miniclaw webdebug logs' to see output`);
}

function handleStop(): void {
  const pid = readPid();
  if (pid === null) {
    console.log("Debug server is not running.");
    process.exit(0);
  }

  try {
    process.kill(pid, "SIGTERM");
    const pidFile = WEBDEBUG_PID_FILE();
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    console.log(`✓ Debug server stopped (PID ${pid}).`);
  } catch (err) {
    console.error(`Failed to stop server: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function handleStatus(): void {
  const pid = readPid();
  if (pid !== null) {
    console.log(`Status: running (PID ${pid})`);
    const logFile = WEBDEBUG_LOG_FILE();
    if (fs.existsSync(logFile)) {
      const mtime = fs.statSync(logFile).mtime;
      console.log(`Log:    ${logFile}`);
      console.log(`Active: last write ${mtime.toLocaleString()}`);
    }
  } else {
    console.log("Status: stopped");
  }
}

function handleLogs(): void {
  const logFile = WEBDEBUG_LOG_FILE();

  if (!fs.existsSync(logFile)) {
    console.log(`No log file at ${logFile}\nStart the debug server first.`);
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
    case "logs":   handleLogs(); break;
    case "attach": handleLogs(); break; // alias
    default:       usage();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
