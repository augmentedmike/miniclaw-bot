/**
 * Service CLI — manage the miniclaw serve daemon.
 *
 * Usage:
 *   miniclaw-service install [--port N]   Install and start the service
 *   miniclaw-service uninstall            Stop and remove the service
 *   miniclaw-service status               Show service status
 *   miniclaw-service logs                 Tail the service error log
 *   miniclaw-service restart [--port N]   Restart the service
 */

import { spawn } from "node:child_process";
import {
  detectPlatform,
  getServicePaths,
  installService,
  uninstallService,
  serviceStatus,
} from "./service.js";
import { ensureMinicawDirs, getMinicawHome } from "./config.js";

function usage(): never {
  console.log(`
Service — manage miniclaw serve daemon

Commands:
  install [--port N]   Install and start the service (default port: 4200)
  uninstall            Stop and remove the service
  status               Show service status
  logs                 Tail the service error log
  restart [--port N]   Restart the service

Platform: ${detectPlatform()} (${detectPlatform() === "macos" ? "launchd" : "systemd"})
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
  return 4200;
}

function handleInstall(args: string[]): void {
  const port = parsePort(args);
  const home = getMinicawHome();
  const paths = getServicePaths(home);

  console.log(`Installing service (${detectPlatform()})...`);
  console.log(`  Home:       ${home}`);
  console.log(`  Entrypoint: ${paths.entrypoint}`);
  console.log(`  Port:       ${port}`);
  console.log(`  Logs:       ${paths.logDir}`);

  installService(home, port);

  // Verify
  setTimeout(() => {
    const s = serviceStatus(home);
    if (s.running) {
      console.log(`Service started (PID ${s.pid})`);
    } else {
      console.log("Service installed but not yet running. Check logs:");
      console.log(`  tail -f ${paths.stderrLog}`);
    }
  }, 2000);
}

function handleUninstall(): void {
  console.log("Uninstalling service...");
  uninstallService();
  console.log("Service removed.");
}

function handleStatus(): void {
  const s = serviceStatus();
  if (s.running) {
    console.log(`Running (PID ${s.pid})`);
  } else {
    console.log("Not running");
  }
}

function handleLogs(): void {
  const paths = getServicePaths();
  const logFile = paths.stderrLog;
  console.log(`Tailing ${logFile} (Ctrl-C to stop)\n`);
  const tail = spawn("tail", ["-f", logFile], { stdio: "inherit" });
  tail.on("error", (err) => {
    console.error(`Failed to tail logs: ${err.message}`);
    process.exit(1);
  });
}

function handleRestart(args: string[]): void {
  const port = parsePort(args);
  console.log("Restarting service...");
  uninstallService();
  installService(getMinicawHome(), port);

  setTimeout(() => {
    const s = serviceStatus();
    if (s.running) {
      console.log(`Service restarted (PID ${s.pid})`);
    } else {
      console.log("Service restarted but not yet running. Check logs.");
    }
  }, 2000);
}

async function main() {
  ensureMinicawDirs();

  const [command, ...args] = process.argv.slice(2);

  if (!command) usage();

  switch (command) {
    case "install":   handleInstall(args); break;
    case "uninstall": handleUninstall(); break;
    case "status":    handleStatus(); break;
    case "logs":      handleLogs(); break;
    case "restart":   handleRestart(args); break;
    default:          usage();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
