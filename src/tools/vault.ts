/**
 * Vault tools for the agent.
 *
 * Provides secure read-only access to the encrypted vault.
 * The agent can retrieve API keys and credentials it needs
 * to call external services, but cannot see the full vault.
 */

import { z } from "zod";
import { tool } from "ai";
import { vaultGet, vaultList } from "../vault.js";
import type { VaultCategory } from "../vault.js";

export const vaultGetTool = tool({
  description:
    "Retrieve a secret from the encrypted vault. Use this to get API keys, " +
    "credentials, or other sensitive data needed for external service calls. " +
    "Returns the secret value and any associated metadata.",
  parameters: z.object({
    category: z.enum(["api-key", "card", "note", "crypto", "credential"])
      .describe("Category of the secret"),
    name: z.string().describe("Name of the secret (e.g. 'gemini', 'openai', 'visa-1234')"),
  }),
  execute: async ({ category, name }) => {
    try {
      const entry = vaultGet(category as VaultCategory, name);
      if (!entry) {
        const available = vaultList(category as VaultCategory);
        if (available.length === 0) {
          return `[not found] No secrets stored under category "${category}". Use the vault CLI to add one.`;
        }
        return `[not found] No secret "${category}/${name}". Available in "${category}": ${available.map((a) => a.name).join(", ")}`;
      }
      const metaStr = entry.meta ? `\nMetadata: ${JSON.stringify(entry.meta)}` : "";
      return `${entry.value}${metaStr}`;
    } catch (err) {
      return `[vault error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

export const vaultListTool = tool({
  description:
    "List available secrets in the vault by category. Does not reveal values, " +
    "only names and categories. Use this to discover what credentials are available.",
  parameters: z.object({
    category: z.enum(["api-key", "card", "note", "crypto", "credential"])
      .optional()
      .describe("Filter by category (omit to list all)"),
  }),
  execute: async ({ category }) => {
    try {
      const entries = vaultList(category as VaultCategory | undefined);
      if (entries.length === 0) {
        return category
          ? `No secrets in category "${category}".`
          : "Vault is empty. Use the vault CLI to add secrets.";
      }
      return entries.map((e) => `${e.category}/${e.name}`).join("\n");
    } catch (err) {
      return `[vault error] ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
