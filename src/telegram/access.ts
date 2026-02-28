/**
 * Telegram access control — first-to-connect-owns-the-bot pattern.
 *
 * The first user to message the bot becomes the owner.
 * Future users must be approved by the owner.
 */
import fs from "node:fs";
import path from "node:path";
import { getActivePersonaHome } from "../config.js";

export type AccessState = {
  ownerId: number | null;
  ownerUsername: string | null;
  allowedUsers: number[];
  pendingUsers: { id: number; username: string | null; requestedAt: string }[];
};

const FILENAME = "telegram-access.json";

function accessPath(): string {
  return path.join(getActivePersonaHome(), FILENAME);
}

export function loadAccess(): AccessState {
  try {
    const raw = fs.readFileSync(accessPath(), "utf8");
    return JSON.parse(raw) as AccessState;
  } catch {
    return { ownerId: null, ownerUsername: null, allowedUsers: [], pendingUsers: [] };
  }
}

export function saveAccess(state: AccessState): void {
  fs.writeFileSync(accessPath(), JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
}

/**
 * Atomically claim ownership. Uses O_EXCL write to a lock file
 * to prevent race conditions when two users message simultaneously.
 */
export function claimOwner(userId: number, username: string | null): AccessState | null {
  const lockPath = accessPath() + ".lock";
  let fd: number;
  try {
    // O_CREAT | O_EXCL — fails if lock file already exists
    fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
    fs.closeSync(fd);
  } catch {
    // Lock file exists — another claim is in progress or already completed
    // Re-read state to check if owner was set
    const current = loadAccess();
    if (current.ownerId !== null) return null; // Already claimed
    // Stale lock — remove and retry once
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    return claimOwner(userId, username);
  }

  try {
    // Double-check: re-read state under lock
    const current = loadAccess();
    if (current.ownerId !== null) {
      return null; // Already claimed between our check and lock
    }

    const state: AccessState = {
      ownerId: userId,
      ownerUsername: username,
      allowedUsers: [userId],
      pendingUsers: [],
    };
    saveAccess(state);
    return state;
  } finally {
    try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
  }
}

export function isAllowed(state: AccessState, userId: number): boolean {
  return state.allowedUsers.includes(userId);
}

export function isPending(state: AccessState, userId: number): boolean {
  return state.pendingUsers.some((p) => p.id === userId);
}

export function addPending(state: AccessState, userId: number, username: string | null): AccessState {
  if (isPending(state, userId) || isAllowed(state, userId)) return state;
  state.pendingUsers.push({ id: userId, username, requestedAt: new Date().toISOString() });
  saveAccess(state);
  return state;
}

export function approveUser(state: AccessState, userId: number): AccessState {
  state.pendingUsers = state.pendingUsers.filter((p) => p.id !== userId);
  if (!state.allowedUsers.includes(userId)) {
    state.allowedUsers.push(userId);
  }
  saveAccess(state);
  return state;
}

export function denyUser(state: AccessState, userId: number): AccessState {
  state.pendingUsers = state.pendingUsers.filter((p) => p.id !== userId);
  saveAccess(state);
  return state;
}

export function revokeUser(state: AccessState, userId: number): AccessState {
  state.allowedUsers = state.allowedUsers.filter((id) => id !== userId);
  saveAccess(state);
  return state;
}
