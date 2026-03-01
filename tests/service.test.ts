import { describe, it, expect } from "vitest";
import {
  detectPlatform,
  getServicePaths,
  generatePlist,
  generateUnit,
} from "../src/service.js";

describe("service", () => {
  describe("detectPlatform", () => {
    it("returns macos or linux", () => {
      const p = detectPlatform();
      expect(["macos", "linux"]).toContain(p);
    });

    it("returns macos on darwin", () => {
      // process.platform is read-only but we can verify the mapping logic
      if (process.platform === "darwin") {
        expect(detectPlatform()).toBe("macos");
      } else {
        expect(detectPlatform()).toBe("linux");
      }
    });
  });

  describe("getServicePaths", () => {
    it("derives all paths from home", () => {
      const paths = getServicePaths("/tmp/test-miniclaw");
      expect(paths.home).toBe("/tmp/test-miniclaw");
      expect(paths.entrypoint).toBe("/tmp/test-miniclaw/system/lib/miniclaw.mjs");
      expect(paths.logDir).toBe("/tmp/test-miniclaw/logs");
      expect(paths.stdoutLog).toBe("/tmp/test-miniclaw/logs/serve.out.log");
      expect(paths.stderrLog).toBe("/tmp/test-miniclaw/logs/serve.err.log");
      expect(paths.nodeBin).toBe(process.execPath);
    });

    it("plist path is under ~/Library/LaunchAgents", () => {
      const paths = getServicePaths("/tmp/test-miniclaw");
      expect(paths.plistPath).toContain("Library/LaunchAgents");
      expect(paths.plistPath).toContain("com.miniclaw.serve.plist");
    });

    it("unit path is under ~/.config/systemd/user", () => {
      const paths = getServicePaths("/tmp/test-miniclaw");
      expect(paths.unitPath).toContain(".config/systemd/user");
      expect(paths.unitPath).toContain("miniclaw-serve.service");
    });
  });

  describe("generatePlist", () => {
    it("generates valid plist XML", () => {
      const paths = getServicePaths("/tmp/test-miniclaw");
      const plist = generatePlist(paths, 4200);

      expect(plist).toContain("<?xml version");
      expect(plist).toContain("com.miniclaw.serve");
      expect(plist).toContain(paths.nodeBin);
      expect(plist).toContain(paths.entrypoint);
      expect(plist).toContain("<string>4200</string>");
      expect(plist).toContain(paths.stdoutLog);
      expect(plist).toContain(paths.stderrLog);
      expect(plist).toContain("<key>KeepAlive</key>");
      expect(plist).toContain("<key>SuccessfulExit</key>");
      expect(plist).toContain("<false/>");
      expect(plist).toContain("<key>ThrottleInterval</key>");
      expect(plist).toContain("<key>RunAtLoad</key>");
      expect(plist).toContain("<true/>");
    });

    it("uses custom port", () => {
      const paths = getServicePaths("/tmp/test-miniclaw");
      const plist = generatePlist(paths, 8080);
      expect(plist).toContain("<string>8080</string>");
    });
  });

  describe("generateUnit", () => {
    it("generates valid systemd unit", () => {
      const paths = getServicePaths("/tmp/test-miniclaw");
      const unit = generateUnit(paths, 4200);

      expect(unit).toContain("[Unit]");
      expect(unit).toContain("[Service]");
      expect(unit).toContain("[Install]");
      expect(unit).toContain(`ExecStart=${paths.nodeBin} ${paths.entrypoint} serve`);
      expect(unit).toContain("Environment=PORT=4200");
      expect(unit).toContain("Environment=MINICLAW_HOME=/tmp/test-miniclaw");
      expect(unit).toContain("EnvironmentFile=-/tmp/test-miniclaw/.env");
      expect(unit).toContain("Restart=on-failure");
      expect(unit).toContain("RestartSec=5");
      expect(unit).toContain("WantedBy=default.target");
    });

    it("uses custom port", () => {
      const paths = getServicePaths("/tmp/test-miniclaw");
      const unit = generateUnit(paths, 9000);
      expect(unit).toContain("Environment=PORT=9000");
    });
  });
});
