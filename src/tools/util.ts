import fs from "node:fs";
import path from "node:path";

/**
 * Format an unknown caught error into a consistent `[error] ...` string.
 * Shared across tool implementations to avoid duplicating the
 * `err instanceof Error ? err.message : String(err)` pattern.
 */
export function formatToolError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `[error] ${msg}`;
}

/**
 * Resolve a path and enforce jail boundary.
 * Returns the resolved absolute path, or throws if it escapes the jail.
 * When no jailDir is set, simply resolves the path.
 *
 * Uses fs.realpathSync to follow symlinks so that a symlink inside the
 * jail pointing outside is caught. Falls back to path.resolve when the
 * target doesn't exist yet (e.g. write_file creating a new file) — in
 * that case we walk up to the nearest existing ancestor and realpath that.
 */
export function resolveJailed(filePath: string, jailDir?: string): string {
  const logical = path.resolve(filePath);
  if (!jailDir) return logical;

  // Resolve the real jail path (follow symlinks on the jail itself)
  let realJail: string;
  try {
    realJail = fs.realpathSync(jailDir);
  } catch {
    realJail = jailDir;
  }

  // Try to get the real path of the target. If it exists, realpath follows symlinks.
  let real: string;
  try {
    real = fs.realpathSync(logical);
  } catch {
    // Target doesn't exist yet (e.g. creating a new file).
    // Walk up to the nearest existing ancestor and realpath that,
    // then append the remaining segments.
    let ancestor = path.dirname(logical);
    let tail = path.basename(logical);
    while (ancestor !== "/" && ancestor !== ".") {
      try {
        const realAncestor = fs.realpathSync(ancestor);
        real = path.join(realAncestor, tail);
        break;
      } catch {
        tail = path.join(path.basename(ancestor), tail);
        ancestor = path.dirname(ancestor);
      }
    }
    // If we couldn't resolve any ancestor, use the logical path
    real ??= logical;
  }

  const normalizedJail = realJail.endsWith("/") ? realJail : realJail + "/";
  if (real !== realJail && !real.startsWith(normalizedJail)) {
    throw new Error(`Path ${logical} is outside jail directory ${jailDir}`);
  }
  return logical;
}
