import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { CoreMessage } from "ai";
import { getAccessToken } from "./auth.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { loadActivePersona, buildPersonaPrompt } from "./persona.js";
import { createShellTool } from "./tools/shell.js";
import { createReadFileTool, createWriteFileTool, createListDirectoryTool } from "./tools/files.js";
import { createEditFileTool } from "./tools/edit.js";
import { createGlobTool } from "./tools/glob.js";
import { createGrepTool } from "./tools/grep.js";
import { webFetchTool, webSearchTool } from "./tools/web.js";
import { memorySaveTool, memorySearchTool, memoryVectorSearchTool, memoryDeepSearchTool } from "./tools/memory.js";
import { claudeCodeTool } from "./tools/claude-code.js";
import { vaultGetTool, vaultListTool } from "./tools/vault.js";
import { kbAddTool, kbSearchTool, kbListTool, kbRemoveTool } from "./tools/kb.js";
import { retrieveContext, saveContext } from "./context.js";
import { loadHistory, appendToHistory, archiveRotatedMessages } from "./conversation.js";
import type { MinicawConfig, Channel } from "./types.js";

export function createTools(config: MinicawConfig) {
  const jail = config.jailDir;
  return {
    shell_exec: createShellTool(config.shellTimeout, jail),
    read_file: createReadFileTool(jail),
    write_file: createWriteFileTool(jail),
    edit_file: createEditFileTool(jail),
    list_directory: createListDirectoryTool(jail),
    glob: createGlobTool(jail),
    grep: createGrepTool(jail),
    web_fetch: webFetchTool,
    web_search: webSearchTool,
    memory_save: memorySaveTool,
    memory_search: memorySearchTool,
    memory_vector_search: memoryVectorSearchTool,
    memory_deep_search: memoryDeepSearchTool,
    claude_code: claudeCodeTool,
    vault_get: vaultGetTool,
    vault_list: vaultListTool,
    kb_add: kbAddTool,
    kb_search: kbSearchTool,
    kb_list: kbListTool,
    kb_remove: kbRemoveTool,
  };
}

export async function runAgent(
  messages: CoreMessage[],
  config: MinicawConfig,
  options?: {
    channel?: Channel;
    userId?: string;
    onText?: (text: string) => void;
    onToolCall?: (toolName: string, args: unknown) => void;
  },
): Promise<{ text: string; messages: CoreMessage[] }> {
  const channel = options?.channel ?? "cli";
  const userId = options?.userId;

  // Prepend conversation history for this user
  if (userId) {
    const history = loadHistory(userId, config.conversationLimit);
    console.error(`[history] ${userId}: ${history.length} prior messages`);
    if (history.length > 0) {
      messages = [...history, ...messages];
    }
  }

  // Extract user message text for context retrieval
  const lastMessage = messages[messages.length - 1];
  const userMessageText = typeof lastMessage?.content === "string"
    ? lastMessage.content
    : "";

  // Pre-turn: retrieve KB context relevant to this message
  const contextFromMemory = await retrieveContext(userMessageText);

  const accessToken = await getAccessToken();

  // OAuth tokens (sk-ant-oat01-*) must use Bearer auth, not x-api-key.
  // The AI SDK always sends apiKey as x-api-key, so we use a custom fetch
  // wrapper to replace it with Authorization: Bearer. The beta headers are
  // required — without oauth-2025-04-20 Anthropic returns 401.
  const oauthFetch: typeof globalThis.fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.delete("x-api-key");
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("anthropic-beta", "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14");
    return globalThis.fetch(input, { ...init, headers });
  };

  const anthropic = createAnthropic({
    apiKey: "oauth-placeholder",
    fetch: oauthFetch,
  });

  const tools = createTools(config);
  const toolNames = Object.keys(tools);

  const persona = loadActivePersona(config);
  const personaPrompt = persona ? buildPersonaPrompt(persona) : undefined;
  const systemPrompt = buildSystemPrompt(toolNames, config.jailDir, channel, contextFromMemory, userId, personaPrompt);

  const result = streamText({
    model: anthropic(config.model),
    system: systemPrompt,
    messages,
    tools,
    maxSteps: config.maxSteps,
  });

  let fullText = "";

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      fullText += part.textDelta;
      options?.onText?.(part.textDelta);
    } else if (part.type === "tool-call") {
      console.error(`[tool-call] ${part.toolName}`);
      options?.onToolCall?.(part.toolName, part.args);
    } else if (part.type === "tool-result") {
      const preview = String(part.result).slice(0, 120);
      console.error(`[tool-result] ${part.toolName}: ${preview}`);
    } else if (part.type === "error") {
      console.error(`[stream-error]`, part.error);
    }
  }

  const response = await result.response;

  // Post-turn: save context to KB
  if (userMessageText && fullText) {
    try {
      await saveContext(channel, userMessageText, fullText);
    } catch {
      // Non-fatal — don't break the response if KB write fails
    }
  }

  // Post-turn: save conversation history for this user
  if (userId) {
    try {
      const newTurns = [
        { role: "user" as const, content: userMessageText },
        ...response.messages,
      ];
      const discarded = appendToHistory(userId, newTurns, config.conversationLimit);
      if (discarded.length > 0) {
        try {
          archiveRotatedMessages(discarded);
        } catch {
          // Non-fatal — don't break the response if archiving fails
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return {
    text: fullText,
    messages: [...messages, ...response.messages],
  };
}
