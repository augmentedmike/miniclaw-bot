/**
 * Service Manager — register miniclaw serve as a system daemon.
 *
 * Supports macOS (launchd) and Linux (systemd user units).
 * Service definition files are generated at runtime so paths are always correct.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getMinicawHome } from "./config.js";

const SERVICE_LABEL = "com.miniclaw.serve";
const UNIT_NAME = "miniclaw-serve.service";
const DEFAULT_PORT = 4200;

const DISPATCH_LABEL = "com.miniclaw.dispatch";
const DISPATCH_UNIT_NAME = "miniclaw-dispatch.service";
const DISPATCH_TIMER_NAME = "miniclaw-dispatch.timer";
const DEFAULT_DISPATCH_INTERVAL = 15;

export type Platform = "macos" | "linux";

export function detectPlatform(): Platform {
  return process.platform === "darwin" ? "macos" : "linux";
}

export interface ServicePaths {
  home: string;
  nodeBin: string;
  entrypoint: string;
  logDir: string;
  stdoutLog: string;
  stderrLog: string;
  plistPath: string;
  unitPath: string;
}

export function getServicePaths(home?: string): ServicePaths {
  const h = home ?? getMinicawHome();
  const userHome = process.env.HOME ?? process.env.USERPROFILE ?? "~";
  return {
    home: h,
    nodeBin: process.execPath,
    entrypoint: path.join(h, "system", "lib", "miniclaw.mjs"),
    logDir: path.join(h, "logs"),
    stdoutLog: path.join(h, "logs", "serve.out.log"),
    stderrLog: path.join(h, "logs", "serve.err.log"),
    plistPath: path.join(userHome, "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`),
    unitPath: path.join(userHome, ".config", "systemd", "user", UNIT_NAME),
  };
}

export function generatePlist(paths: ServicePaths, port: number = DEFAULT_PORT): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${paths.nodeBin}</string>
    <string>${paths.entrypoint}</string>
    <string>serve</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${port}</string>
    <key>MINICLAW_HOME</key>
    <string>${paths.home}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${paths.home}</string>
  <key>StandardOutPath</key>
  <string>${paths.stdoutLog}</string>
  <key>StandardErrorPath</key>
  <string>${paths.stderrLog}</string>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>`;
}

export function generateUnit(paths: ServicePaths, port: number = DEFAULT_PORT): string {
  return `[Unit]
Description=Miniclaw Serve
After=network.target

[Service]
Type=simple
ExecStart=${paths.nodeBin} ${paths.entrypoint} serve
WorkingDirectory=${paths.home}
Environment=PORT=${port}
Environment=MINICLAW_HOME=${paths.home}
EnvironmentFile=-${paths.home}/.env
StandardOutput=append:${paths.stdoutLog}
StandardError=append:${paths.stderrLog}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target`;
}

function run(cmd: string, ignoreError = false): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (e) {
    if (ignoreError) return "";
    throw e;
  }
}

export function installService(home?: string, port: number = DEFAULT_PORT): void {
  const platform = detectPlatform();
  const paths = getServicePaths(home);

  // Ensure log directory exists
  fs.mkdirSync(paths.logDir, { recursive: true });

  // Stop existing service first
  try { uninstallService(home); } catch { /* ignore if not installed */ }

  if (platform === "macos") {
    fs.mkdirSync(path.dirname(paths.plistPath), { recursive: true });
    fs.writeFileSync(paths.plistPath, generatePlist(paths, port), "utf8");
    run(`launchctl load -w "${paths.plistPath}"`);
  } else {
    fs.mkdirSync(path.dirname(paths.unitPath), { recursive: true });
    fs.writeFileSync(paths.unitPath, generateUnit(paths, port), "utf8");
    run("systemctl --user daemon-reload");
    run(`systemctl --user enable --now ${UNIT_NAME}`);
  }
}

export function uninstallService(home?: string): void {
  const platform = detectPlatform();
  const paths = getServicePaths(home);

  if (platform === "macos") {
    if (fs.existsSync(paths.plistPath)) {
      run(`launchctl unload -w "${paths.plistPath}"`, true);
      fs.unlinkSync(paths.plistPath);
    }
  } else {
    run(`systemctl --user disable --now ${UNIT_NAME}`, true);
    if (fs.existsSync(paths.unitPath)) {
      fs.unlinkSync(paths.unitPath);
    }
    run("systemctl --user daemon-reload", true);
  }
}

export interface ServiceStatus {
  running: boolean;
  pid?: number;
}

export function serviceStatus(home?: string): ServiceStatus {
  const platform = detectPlatform();

  if (platform === "macos") {
    const out = run(`launchctl list | grep ${SERVICE_LABEL}`, true);
    if (!out) return { running: false };
    // launchctl list format: PID\tStatus\tLabel
    const parts = out.split(/\s+/);
    const pid = parseInt(parts[0], 10);
    return { running: !isNaN(pid) && pid > 0, pid: isNaN(pid) ? undefined : pid };
  } else {
    const active = run(`systemctl --user is-active ${UNIT_NAME}`, true);
    if (active !== "active") return { running: false };
    const pidStr = run(`systemctl --user show ${UNIT_NAME} --property=MainPID --value`, true);
    const pid = parseInt(pidStr, 10);
    return { running: true, pid: isNaN(pid) || pid === 0 ? undefined : pid };
  }
}

// ── Dispatch cron/timer ─────────────────────────────────────────────

export interface DispatchPaths {
  home: string;
  nodeBin: string;
  entrypoint: string;
  logDir: string;
  stdoutLog: string;
  stderrLog: string;
  plistPath: string;
  unitPath: string;
  timerPath: string;
}

export function getDispatchPaths(home?: string): DispatchPaths {
  const h = home ?? getMinicawHome();
  const userHome = process.env.HOME ?? process.env.USERPROFILE ?? "~";
  return {
    home: h,
    nodeBin: process.execPath,
    entrypoint: path.join(h, "system", "lib", "dispatch-cli.mjs"),
    logDir: path.join(h, "logs"),
    stdoutLog: path.join(h, "logs", "dispatch.out.log"),
    stderrLog: path.join(h, "logs", "dispatch.err.log"),
    plistPath: path.join(userHome, "Library", "LaunchAgents", `${DISPATCH_LABEL}.plist`),
    unitPath: path.join(userHome, ".config", "systemd", "user", DISPATCH_UNIT_NAME),
    timerPath: path.join(userHome, ".config", "systemd", "user", DISPATCH_TIMER_NAME),
  };
}

export function generateDispatchPlist(
  paths: DispatchPaths,
  intervalMinutes: number = DEFAULT_DISPATCH_INTERVAL,
): string {
  const intervalSeconds = intervalMinutes * 60;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DISPATCH_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${paths.nodeBin}</string>
    <string>${paths.entrypoint}</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MINICLAW_HOME</key>
    <string>${paths.home}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${paths.home}</string>
  <key>StandardOutPath</key>
  <string>${paths.stdoutLog}</string>
  <key>StandardErrorPath</key>
  <string>${paths.stderrLog}</string>
  <key>StartInterval</key>
  <integer>${intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>`;
}

export function generateDispatchUnit(paths: DispatchPaths): string {
  return `[Unit]
Description=Miniclaw Dispatch Agent

[Service]
Type=oneshot
ExecStart=${paths.nodeBin} ${paths.entrypoint} run
WorkingDirectory=${paths.home}
Environment=MINICLAW_HOME=${paths.home}
EnvironmentFile=-${paths.home}/.env
StandardOutput=append:${paths.stdoutLog}
StandardError=append:${paths.stderrLog}`;
}

export function generateDispatchTimer(
  intervalMinutes: number = DEFAULT_DISPATCH_INTERVAL,
): string {
  return `[Unit]
Description=Miniclaw Dispatch Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=${intervalMinutes}min
Unit=${DISPATCH_UNIT_NAME}

[Install]
WantedBy=timers.target`;
}

export function installDispatch(
  home?: string,
  intervalMinutes: number = DEFAULT_DISPATCH_INTERVAL,
): void {
  const platform = detectPlatform();
  const paths = getDispatchPaths(home);

  fs.mkdirSync(paths.logDir, { recursive: true });

  // Stop existing first
  try { uninstallDispatch(home); } catch { /* ignore if not installed */ }

  if (platform === "macos") {
    fs.mkdirSync(path.dirname(paths.plistPath), { recursive: true });
    fs.writeFileSync(paths.plistPath, generateDispatchPlist(paths, intervalMinutes), "utf8");
    run(`launchctl load -w "${paths.plistPath}"`);
  } else {
    fs.mkdirSync(path.dirname(paths.unitPath), { recursive: true });
    fs.writeFileSync(paths.unitPath, generateDispatchUnit(paths), "utf8");
    fs.writeFileSync(paths.timerPath, generateDispatchTimer(intervalMinutes), "utf8");
    run("systemctl --user daemon-reload");
    run(`systemctl --user enable --now ${DISPATCH_TIMER_NAME}`);
  }
}

export function uninstallDispatch(home?: string): void {
  const platform = detectPlatform();
  const paths = getDispatchPaths(home);

  if (platform === "macos") {
    if (fs.existsSync(paths.plistPath)) {
      run(`launchctl unload -w "${paths.plistPath}"`, true);
      fs.unlinkSync(paths.plistPath);
    }
  } else {
    run(`systemctl --user disable --now ${DISPATCH_TIMER_NAME}`, true);
    if (fs.existsSync(paths.unitPath)) fs.unlinkSync(paths.unitPath);
    if (fs.existsSync(paths.timerPath)) fs.unlinkSync(paths.timerPath);
    run("systemctl --user daemon-reload", true);
  }
}

export function dispatchStatus(home?: string): ServiceStatus {
  const platform = detectPlatform();

  if (platform === "macos") {
    const out = run(`launchctl list | grep ${DISPATCH_LABEL}`, true);
    if (!out) return { running: false };
    const parts = out.split(/\s+/);
    const pid = parseInt(parts[0], 10);
    return { running: !isNaN(pid) && pid > 0, pid: isNaN(pid) ? undefined : pid };
  } else {
    const active = run(`systemctl --user is-active ${DISPATCH_TIMER_NAME}`, true);
    return { running: active === "active" };
  }
}
