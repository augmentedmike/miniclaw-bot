import path from "node:path";
import { z } from "zod";
import { tool } from "ai";
import { runProcess } from "./run-process.js";
import { resolveJailed } from "./util.js";

/**
 * Check if a shell command tries to escape the jail by referencing
 * absolute paths outside it, using relative traversal, or other escapes.
 * Returns an error message if blocked, or null if allowed.
 */
function checkCommandJail(command: string, jailDir: string): string | null {
  // Block relative traversal (../ or ..\) — this can escape the cwd jail
  if (/\.\.[\\/]/.test(command) || /\.\.$/.test(command)) {
    return `[error] Command contains '..' traversal which could escape jail directory ${jailDir}`;
  }

  // Block tilde expansion (~ expands to $HOME in shell)
  if (/(?:^|[\s;|&`$("'])~(?:[\s\/;|&`)"']|$)/.test(command)) {
    return `[error] Command contains '~' home expansion which could escape jail directory ${jailDir}`;
  }

  // Block $HOME, ${HOME}, and any variable used to build an absolute path
  if (/\$HOME\b|\$\{HOME\}/.test(command)) {
    return `[error] Command references $HOME which could escape jail directory ${jailDir}`;
  }

  // Block /$VAR patterns — variables used to construct absolute paths
  if (/\/\$[A-Za-z_]/.test(command) || /\/\$\{[A-Za-z_]/.test(command)) {
    return `[error] Command uses variables to construct an absolute path which could escape jail directory ${jailDir}`;
  }

  // Block piping into a shell interpreter — this is the primary mechanism
  // for hiding commands (base64 decode, hex encode, etc.)
  if (/\|\s*(sh|bash|zsh|dash|ksh|fish|env\s+sh|env\s+bash)\b/.test(command)) {
    return `[error] Command pipes into a shell interpreter which could bypass jail restrictions`;
  }

  // Block eval and source — same class of attack as pipe-to-shell
  if (/\beval\s/.test(command) || /\bsource\s/.test(command) || /^\.\s/.test(command)) {
    return `[error] Command uses eval/source which could bypass jail restrictions`;
  }

  // Block printf/echo with hex/octal escapes used to construct paths
  // Pattern: printf with \x or \0 sequences (used to build /etc/hosts from hex)
  if (/\bprintf\b.*\\x[0-9a-fA-F]{2}/.test(command)) {
    return `[error] Command uses printf with hex escapes which could construct paths outside jail`;
  }
  if (/\bprintf\b.*\\0[0-9]{1,3}/.test(command)) {
    return `[error] Command uses printf with octal escapes which could construct paths outside jail`;
  }

  // Block $'\xNN' ANSI-C quoting (another way to encode paths)
  if (/\$'[^']*\\x[0-9a-fA-F]/.test(command)) {
    return `[error] Command uses ANSI-C quoting with hex escapes which could bypass jail restrictions`;
  }

  // Block base64 decoding (commonly used to hide payloads)
  if (/\bbase64\s+(-d|--decode)\b/.test(command)) {
    return `[error] Command uses base64 decode which could bypass jail restrictions`;
  }

  // Block xxd reverse (hex to binary, another encoding escape)
  if (/\bxxd\s+-r\b/.test(command)) {
    return `[error] Command uses xxd reverse which could bypass jail restrictions`;
  }

  // Block python/perl/ruby/node one-liners that could do anything
  if (/\b(python3?|perl|ruby|node)\s+-[ec]\b/.test(command)) {
    return `[error] Command invokes an interpreter inline which could bypass jail restrictions`;
  }

  // Block absolute paths outside the jail.
  const absolutePathRe = /(?:^|[\s;|&`$("'])(\/([\w.\-\/]+))/g;
  let match: RegExpExecArray | null;
  const normalizedJail = jailDir.endsWith("/") ? jailDir : jailDir + "/";

  while ((match = absolutePathRe.exec(command)) !== null) {
    const absPath = match[1]!;
    // Allow standard command paths and /dev/null
    if (absPath.startsWith("/dev/") || absPath === "/dev") continue;
    // Allow paths inside jail
    if (absPath === jailDir || absPath.startsWith(normalizedJail)) continue;
    // Allow common bin paths that are just commands, not data access
    if (/^\/(usr\/)?(local\/)?s?bin\//.test(absPath)) continue;
    // Block everything else
    return `[error] Command references path '${absPath}' which is outside jail directory ${jailDir}`;
  }

  return null;
}

export function createShellTool(timeoutMs: number = 30_000, jailDir?: string) {
  return tool({
    description:
      "Execute a shell command and return its output. " +
      "Use for running system commands, scripts, package managers, git, etc. " +
      "Commands run in the user's default shell with their full environment.",
    parameters: z.object({
      command: z.string().describe("The shell command to execute"),
      workdir: z.string().optional().describe("Working directory (defaults to cwd)"),
      timeout: z.number().optional().describe("Timeout in milliseconds (default 30s)"),
    }),
    execute: async ({ command, workdir, timeout }) => {
      const effectiveTimeout = timeout ?? timeoutMs;
      const shell = process.env.SHELL ?? "/bin/sh";

      let cwd: string;
      if (workdir) {
        try {
          cwd = resolveJailed(workdir, jailDir);
        } catch (err) {
          return `[error] ${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        cwd = jailDir ?? process.cwd();
      }

      // When jailed, inspect the command for escape attempts
      if (jailDir) {
        const blocked = checkCommandJail(command, jailDir);
        if (blocked) return blocked;
      }

      return runProcess({
        command: shell,
        args: ["-c", command],
        spawnOpts: {
          cwd,
          timeout: effectiveTimeout,
          env: process.env,
        },
        formatResult: (stdout, stderr, exitCode) => {
          const parts: string[] = [];
          if (stdout.trim()) parts.push(stdout.trim());
          if (stderr.trim()) parts.push(`[stderr]\n${stderr.trim()}`);
          if (exitCode !== 0 && exitCode !== null) {
            parts.push(`[exit code: ${exitCode}]`);
          }
          return parts.join("\n\n") || "(no output)";
        },
        formatError: (err) => `[error] ${err.message}`,
      });
    },
  });
}
