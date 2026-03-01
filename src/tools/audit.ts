import { z } from "zod";
import { tool } from "ai";

export type AuditWriter = (level: "info" | "warn" | "error", message: string) => void;

export function createAuditLogTool(writer: AuditWriter) {
  return tool({
    description:
      "Log a progress entry to the dispatch audit trail. Use to record " +
      "what you've done, decisions made, errors encountered, or status updates.",
    parameters: z.object({
      level: z.enum(["info", "warn", "error"]).describe("Log level"),
      message: z.string().describe("What happened — be specific and concise"),
    }),
    execute: async ({ level, message }) => {
      writer(level, message);
      return `Logged [${level}]: ${message}`;
    },
  });
}
