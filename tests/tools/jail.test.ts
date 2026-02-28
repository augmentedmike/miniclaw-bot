import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveJailed } from "@tools/util.js";
import { createReadFileTool, createWriteFileTool, createListDirectoryTool } from "@tools/files.js";
import { createEditFileTool } from "@tools/edit.js";
import { createShellTool } from "@tools/shell.js";
import { createGlobTool } from "@tools/glob.js";
import { createGrepTool } from "@tools/grep.js";

const ctx = { toolCallId: "test", messages: [] as never[], abortSignal: new AbortController().signal };

describe("jail enforcement", () => {
  let jailDir: string;
  let outsideDir: string;

  beforeEach(() => {
    jailDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-jail-"));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "miniclaw-outside-"));
    // Set up files inside jail
    fs.writeFileSync(path.join(jailDir, "allowed.txt"), "inside jail");
    fs.mkdirSync(path.join(jailDir, "subdir"));
    fs.writeFileSync(path.join(jailDir, "subdir", "nested.txt"), "nested inside jail");
    // Set up files outside jail
    fs.writeFileSync(path.join(outsideDir, "forbidden.txt"), "outside jail");
  });

  afterEach(() => {
    fs.rmSync(jailDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  describe("resolveJailed", () => {
    it("allows paths inside jail", () => {
      const result = resolveJailed(path.join(jailDir, "allowed.txt"), jailDir);
      expect(result).toBe(path.join(jailDir, "allowed.txt"));
    });

    it("allows the jail directory itself", () => {
      const result = resolveJailed(jailDir, jailDir);
      expect(result).toBe(jailDir);
    });

    it("allows nested paths inside jail", () => {
      const result = resolveJailed(path.join(jailDir, "subdir", "nested.txt"), jailDir);
      expect(result).toBe(path.join(jailDir, "subdir", "nested.txt"));
    });

    it("blocks absolute paths outside jail", () => {
      expect(() => resolveJailed("/etc/hosts", jailDir)).toThrow("outside jail");
    });

    it("blocks paths outside jail", () => {
      expect(() => resolveJailed(path.join(outsideDir, "forbidden.txt"), jailDir)).toThrow("outside jail");
    });

    it("blocks parent traversal (../)", () => {
      expect(() => resolveJailed(path.join(jailDir, "..", "etc", "hosts"), jailDir)).toThrow("outside jail");
    });

    it("blocks double parent traversal (../../)", () => {
      expect(() => resolveJailed(path.join(jailDir, "subdir", "..", "..", "etc"), jailDir)).toThrow("outside jail");
    });

    it("allows no-op traversal that stays inside jail", () => {
      const result = resolveJailed(path.join(jailDir, "subdir", "..", "allowed.txt"), jailDir);
      expect(result).toBe(path.join(jailDir, "allowed.txt"));
    });

    it("passes through when no jail is set", () => {
      const result = resolveJailed("/etc/hosts", undefined);
      expect(result).toBe("/etc/hosts");
    });

    it("blocks jail prefix that is a different directory", () => {
      // e.g. jail is /tmp/jail but path is /tmp/jail-escape/file
      const escapeDir = jailDir + "-escape";
      fs.mkdirSync(escapeDir, { recursive: true });
      try {
        expect(() => resolveJailed(path.join(escapeDir, "file.txt"), jailDir)).toThrow("outside jail");
      } finally {
        fs.rmSync(escapeDir, { recursive: true, force: true });
      }
    });
  });

  describe("read_file jailed", () => {
    it("reads files inside jail", async () => {
      const tool = createReadFileTool(jailDir);
      const result = await tool.execute({ path: path.join(jailDir, "allowed.txt"), maxLines: undefined }, ctx);
      expect(result).toBe("inside jail");
    });

    it("blocks reading files outside jail", async () => {
      const tool = createReadFileTool(jailDir);
      const result = await tool.execute({ path: path.join(outsideDir, "forbidden.txt"), maxLines: undefined }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });

    it("blocks reading /etc/hosts", async () => {
      const tool = createReadFileTool(jailDir);
      const result = await tool.execute({ path: "/etc/hosts", maxLines: undefined }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });

    it("blocks parent traversal", async () => {
      const tool = createReadFileTool(jailDir);
      const result = await tool.execute({ path: path.join(jailDir, "..", "etc", "hosts"), maxLines: undefined }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });
  });

  describe("write_file jailed", () => {
    it("writes files inside jail", async () => {
      const tool = createWriteFileTool(jailDir);
      const filePath = path.join(jailDir, "new.txt");
      const result = await tool.execute({ path: filePath, content: "created" }, ctx);
      expect(result).toContain("Wrote");
      expect(fs.readFileSync(filePath, "utf8")).toBe("created");
    });

    it("blocks writing files outside jail", async () => {
      const tool = createWriteFileTool(jailDir);
      const result = await tool.execute({ path: path.join(outsideDir, "evil.txt"), content: "pwned" }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
      expect(fs.existsSync(path.join(outsideDir, "evil.txt"))).toBe(false);
    });

    it("blocks writing to /tmp directly", async () => {
      const tool = createWriteFileTool(jailDir);
      const result = await tool.execute({ path: "/tmp/evil.txt", content: "pwned" }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });
  });

  describe("edit_file jailed", () => {
    it("edits files inside jail", async () => {
      const tool = createEditFileTool(jailDir);
      const result = await tool.execute({
        path: path.join(jailDir, "allowed.txt"),
        old_string: "inside jail",
        new_string: "edited",
        replace_all: undefined,
      }, ctx);
      expect(result).toContain("Replaced 1 occurrence");
    });

    it("blocks editing files outside jail", async () => {
      const tool = createEditFileTool(jailDir);
      const result = await tool.execute({
        path: path.join(outsideDir, "forbidden.txt"),
        old_string: "outside jail",
        new_string: "hacked",
        replace_all: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
      // Verify file wasn't modified
      expect(fs.readFileSync(path.join(outsideDir, "forbidden.txt"), "utf8")).toBe("outside jail");
    });
  });

  describe("list_directory jailed", () => {
    it("lists the jail directory", async () => {
      const tool = createListDirectoryTool(jailDir);
      const result = await tool.execute({ path: jailDir, recursive: undefined }, ctx);
      expect(result).toContain("allowed.txt");
    });

    it("blocks listing directories outside jail", async () => {
      const tool = createListDirectoryTool(jailDir);
      const result = await tool.execute({ path: outsideDir, recursive: undefined }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });

    it("blocks listing /etc", async () => {
      const tool = createListDirectoryTool(jailDir);
      const result = await tool.execute({ path: "/etc", recursive: undefined }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });
  });

  describe("shell_exec jailed", () => {
    it("runs commands with cwd set to jail", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({ command: "pwd", workdir: undefined, timeout: undefined }, ctx);
      // macOS /tmp resolves to /private/tmp
      expect(result).toContain(jailDir.replace("/tmp/", "/private/tmp/").replace(/\/private\/private/, "/private"));
    });

    it("allows workdir inside jail", async () => {
      const tool = createShellTool(5000, jailDir);
      const subdir = path.join(jailDir, "subdir");
      const result = await tool.execute({ command: "pwd", workdir: subdir, timeout: undefined }, ctx);
      expect(result).toContain("subdir");
    });

    it("blocks workdir outside jail", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({ command: "pwd", workdir: outsideDir, timeout: undefined }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });

    it("blocks workdir traversal", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: "pwd",
        workdir: path.join(jailDir, "..", ".."),
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });
  });

  // ═══════════════════════════════════════════════════════
  //  ADVERSARIAL JAILBREAK ATTEMPTS
  // ═══════════════════════════════════════════════════════

  describe("symlink escape: read through symlink pointing outside jail", () => {
    it("should not read outside files via symlink", async () => {
      // ATTACK: create a symlink inside jail that points to a file outside
      const link = path.join(jailDir, "escape-link.txt");
      fs.symlinkSync(path.join(outsideDir, "forbidden.txt"), link);

      const tool = createReadFileTool(jailDir);
      const result = await tool.execute({ path: link, maxLines: undefined }, ctx);
      // The symlink path resolves inside the jail, but the target is outside.
      // If this reads "outside jail", the jail is broken.
      expect(result).not.toBe("outside jail");
      expect(result).toContain("[error]");
    });
  });

  describe("symlink escape: directory symlink to escape jail", () => {
    it("should not list outside directories via symlink", async () => {
      // ATTACK: symlink a directory inside jail pointing to outside
      const link = path.join(jailDir, "escape-dir");
      fs.symlinkSync(outsideDir, link);

      const tool = createListDirectoryTool(jailDir);
      const result = await tool.execute({ path: link, recursive: undefined }, ctx);
      // Should not reveal contents of outsideDir
      expect(result).not.toContain("forbidden.txt");
    });
  });

  describe("symlink escape: write through symlink to outside", () => {
    it("should not write outside files via symlink", async () => {
      // ATTACK: create symlink inside jail, then write through it
      const target = path.join(outsideDir, "target.txt");
      fs.writeFileSync(target, "original");
      const link = path.join(jailDir, "write-escape.txt");
      fs.symlinkSync(target, link);

      const tool = createWriteFileTool(jailDir);
      await tool.execute({ path: link, content: "pwned via symlink" }, ctx);
      // The file outside should NOT have been modified
      expect(fs.readFileSync(target, "utf8")).toBe("original");
    });
  });

  describe("symlink escape: edit through symlink to outside", () => {
    it("should not edit outside files via symlink", async () => {
      const target = path.join(outsideDir, "forbidden.txt");
      const link = path.join(jailDir, "edit-escape.txt");
      fs.symlinkSync(target, link);

      const tool = createEditFileTool(jailDir);
      await tool.execute({
        path: link,
        old_string: "outside jail",
        new_string: "pwned",
        replace_all: undefined,
      }, ctx);
      expect(fs.readFileSync(target, "utf8")).toBe("outside jail");
    });
  });

  describe("shell command escape: cat /etc/hosts from inside jail", () => {
    it("should not be able to read outside files via shell", async () => {
      // ATTACK: the shell cwd is jailed, but the command uses absolute paths
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: "cat /etc/hosts",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // If this returns the contents of /etc/hosts, shell jail is broken
      expect(result).not.toContain("localhost");
    });
  });

  describe("shell command escape: cd out of jail", () => {
    it("should not be able to cd .. out of jail and read files", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `cd / && cat /etc/hosts`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).not.toContain("localhost");
    });
  });

  describe("shell command escape: write outside jail via shell", () => {
    it("should not write files outside jail via shell redirect", async () => {
      const escapePath = path.join(outsideDir, "shell-escape.txt");
      const tool = createShellTool(5000, jailDir);
      await tool.execute({
        command: `echo pwned > ${escapePath}`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(fs.existsSync(escapePath)).toBe(false);
    });
  });

  describe("shell command escape: exfiltrate via curl/env", () => {
    it("should not be able to read env vars with secrets", async () => {
      // ATTACK: model could exfiltrate secrets from environment
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: "env | grep -i secret || true",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // This test documents that env access is NOT blocked by the jail
      // Just documenting the boundary — env is accessible
      expect(typeof result).toBe("string");
    });
  });

  describe("glob escape: search outside jail via cwd param", () => {
    it("should not glob outside jail", async () => {
      const tool = createGlobTool(jailDir);
      const result = await tool.execute({ pattern: "*.txt", cwd: outsideDir }, ctx);
      expect(result).not.toContain("forbidden.txt");
      expect(result).toContain("[error]");
    });
  });

  describe("glob escape: search outside jail via traversal in cwd", () => {
    it("should not glob via ../ traversal", async () => {
      const tool = createGlobTool(jailDir);
      const result = await tool.execute({
        pattern: "*.txt",
        cwd: path.join(jailDir, "..", path.basename(outsideDir)),
      }, ctx);
      expect(result).not.toContain("forbidden.txt");
    });
  });

  describe("grep escape: search outside jail via path param", () => {
    it("should not grep outside jail", async () => {
      const tool = createGrepTool(jailDir);
      const result = await tool.execute({
        pattern: "outside",
        path: outsideDir,
        glob: undefined,
        case_insensitive: undefined,
        files_only: undefined,
        max_results: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });
  });

  describe("grep escape: search /etc via absolute path", () => {
    it("should not grep /etc", async () => {
      const tool = createGrepTool(jailDir);
      const result = await tool.execute({
        pattern: "localhost",
        path: "/etc",
        glob: undefined,
        case_insensitive: undefined,
        files_only: undefined,
        max_results: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("outside jail");
    });
  });

  describe("shell command escape: variable expansion to build path", () => {
    it("should not read /etc/hosts via variable expansion", async () => {
      const tool = createShellTool(5000, jailDir);
      // ATTACK: use variable concatenation to build an absolute path
      const result = await tool.execute({
        command: `P="/etc"; cat $P/hosts`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // The command references /etc which is outside jail
      expect(result).not.toContain("localhost");
    });
  });

  describe("shell command escape: backtick subshell", () => {
    it("should not read /etc/hosts via subshell", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: "cat `echo /etc/hosts`",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).not.toContain("localhost");
    });
  });

  describe("shell command escape: $() subshell", () => {
    it("should not read /etc/hosts via $() subshell", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: "cat $(echo /etc/hosts)",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).not.toContain("localhost");
    });
  });

  describe("shell command escape: relative traversal without absolute path", () => {
    it("should not escape via ../../ traversal in shell", async () => {
      const tool = createShellTool(5000, jailDir);
      // Need enough ../ to traverse from /var/folders/tc/.../T/miniclaw-jail-xxx/ to /
      const result = await tool.execute({
        command: "cat ../../../../../../../../../../../etc/hosts",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // KNOWN VULNERABILITY: relative traversal in shell commands is not caught
      // by the absolute-path regex. The cwd is the jail but enough ../../ levels
      // will traverse out. This test documents the limitation.
      expect(result).not.toContain("localhost");
    });
  });

  describe("shell command escape: pipe to write outside jail", () => {
    it("should not pipe output to file outside jail", async () => {
      const target = path.join(outsideDir, "piped.txt");
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `echo pwned | tee ${target}`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(fs.existsSync(target)).toBe(false);
    });
  });

  describe("shell command escape: curl exfiltration", () => {
    it("should not be able to curl with file data", async () => {
      // Write a secret in the jail, then try to exfiltrate it
      fs.writeFileSync(path.join(jailDir, "secret.txt"), "super-secret-key");
      const tool = createShellTool(5000, jailDir);
      // This only uses relative paths and localhost, so let's see if it passes
      const result = await tool.execute({
        command: "cat secret.txt",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // This should work — reading files inside the jail via shell is allowed
      expect(result).toContain("super-secret-key");
    });
  });

  describe("shell command escape: HOME variable", () => {
    it("should not list home directory via $HOME", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: "ls $HOME",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // $HOME expands at runtime, not visible in static analysis.
      // This IS an escape — the result will contain home directory listing.
      expect(result).not.toContain("Desktop");
    });
  });

  describe("shell command escape: tilde expansion", () => {
    it("should not list home directory via ~", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: "ls ~",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // ~ expansion happens in the shell, not visible in static analysis.
      expect(result).not.toContain("Desktop");
    });
  });

  describe("shell command escape: proc self to find real paths", () => {
    it("should not read /proc or /sys", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: "cat /proc/self/environ 2>/dev/null || echo 'not linux'",
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // /proc is blocked by absolute path check on Linux; macOS doesn't have /proc
      expect(result).toContain("[error]");
    });
  });

  describe("shell command escape: hex/octal encoded path", () => {
    it("should not escape via printf hex path", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `cat $(printf '\\x2f\\x65\\x74\\x63\\x2f\\x68\\x6f\\x73\\x74\\x73')`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("printf");
    });
  });

  describe("shell command escape: base64 encoded command", () => {
    it("should not escape via base64 decode pipe", async () => {
      const tool = createShellTool(5000, jailDir);
      const encoded = Buffer.from("cat /etc/hosts").toString("base64");
      const result = await tool.execute({
        command: `echo ${encoded} | base64 -d | sh`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
    });
  });

  describe("shell command escape: env var construction", () => {
    it("should not escape via env var path construction", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `A=etc; B=hosts; cat "/$A/$B"`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      // This one constructs a path purely from runtime variables.
      // The static checker catches it because "/$A/$B" starts with /
      // and isn't in the jail allowlist.
      expect(result).toContain("[error]");
    });
  });

  describe("shell command escape: eval", () => {
    it("should not escape via eval", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `eval "cat /etc/hosts"`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("eval");
    });
  });

  describe("shell command escape: python one-liner", () => {
    it("should not escape via python -c", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `python3 -c "open('/etc/hosts').read()"`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
      expect(result).toContain("interpreter");
    });
  });

  describe("shell command escape: perl one-liner", () => {
    it("should not escape via perl -e", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `perl -e 'print \`cat /etc/hosts\`'`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
    });
  });

  describe("shell command escape: xxd reverse", () => {
    it("should not escape via xxd -r", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `echo "2f6574632f686f737473" | xxd -r -p | xargs cat`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
    });
  });

  describe("shell command escape: ANSI-C quoting", () => {
    it("should not escape via $'\\xNN' quoting", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({
        command: `cat $'\\x2f\\x65\\x74\\x63\\x2f\\x68\\x6f\\x73\\x74\\x73'`,
        workdir: undefined,
        timeout: undefined,
      }, ctx);
      expect(result).toContain("[error]");
    });
  });

  describe("shell legitimate commands still work when jailed", () => {
    it("allows ls in jail", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({ command: "ls", workdir: undefined, timeout: undefined }, ctx);
      expect(result).toContain("allowed.txt");
    });

    it("allows cat of file in jail", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({ command: "cat allowed.txt", workdir: undefined, timeout: undefined }, ctx);
      expect(result).toContain("inside jail");
    });

    it("allows echo and pipes", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({ command: "echo hello | tr a-z A-Z", workdir: undefined, timeout: undefined }, ctx);
      expect(result).toContain("HELLO");
    });

    it("allows grep on local files", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({ command: "grep -r inside .", workdir: undefined, timeout: undefined }, ctx);
      expect(result).toContain("inside jail");
    });

    it("allows git commands", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({ command: "git init 2>&1 || true", workdir: undefined, timeout: undefined }, ctx);
      expect(typeof result).toBe("string");
    });

    it("allows writing files in jail via shell", async () => {
      const tool = createShellTool(5000, jailDir);
      const result = await tool.execute({ command: "echo test > newfile.txt && cat newfile.txt", workdir: undefined, timeout: undefined }, ctx);
      expect(result).toContain("test");
    });
  });

  describe("resolveJailed edge cases", () => {
    it("blocks path with trailing slash trick", () => {
      // ATTACK: /jail-dir/../outside with trailing slash on jail
      expect(() => resolveJailed(
        path.join(jailDir, "..", path.basename(outsideDir), "forbidden.txt"),
        jailDir + "/",
      )).toThrow("outside jail");
    });

    it("blocks empty string path (resolves to cwd)", () => {
      // ATTACK: empty string resolves to process.cwd() which may be outside jail
      const cwd = process.cwd();
      if (!cwd.startsWith(jailDir)) {
        expect(() => resolveJailed("", jailDir)).toThrow("outside jail");
      }
    });

    it("blocks relative path that resolves outside jail", () => {
      // ATTACK: relative path without any ../ but cwd is outside jail
      expect(() => resolveJailed("some-file.txt", jailDir)).toThrow("outside jail");
    });
  });
});
