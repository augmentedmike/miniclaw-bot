/**
 * Convenience accessor — opens a KBEngine for the active persona.
 * The engine is cached per dbPath so repeated calls reuse the same instance.
 */

import path from "node:path";
import { getActivePersonaHome } from "../config.js";
import { KBEngine } from "./engine.js";

const cache = new Map<string, KBEngine>();

/** Get (or create) the KB engine for the active persona. */
export function getKB(): KBEngine {
  const personaHome = getActivePersonaHome();
  const dbPath = path.join(personaHome, "kb", "vectors.db");

  const existing = cache.get(dbPath);
  if (existing) return existing;

  const engine = new KBEngine(dbPath);
  cache.set(dbPath, engine);
  return engine;
}

/** Close and remove a cached engine (for testing / cleanup). */
export function closeKB(): void {
  for (const [key, engine] of cache) {
    engine.close();
    cache.delete(key);
  }
}
