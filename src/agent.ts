import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { CoreMessage } from "ai";
import { getAccessToken } from "./auth.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { createShellTool } from "./tools/shell.js";
import { readFileTool, writeFileTool, listDirectoryTool } from "./tools/files.js";
import { editFileTool } from "./tools/edit.js";
import { globTool } from "./tools/glob.js";
import { grepTool } from "./tools/grep.js";
import { webFetchTool, webSearchTool } from "./tools/web.js";
import { memorySaveTool, memorySearchTool } from "./tools/memory.js";
import { claudeCodeTool } from "./tools/claude-code.js";
import { vaultGetTool, vaultListTool } from "./tools/vault.js";
import type { MinicawConfig } from "./types.js";

export function createTools(config: MinicawConfig) {
  return {
    shell_exec: createShellTool(config.shellTimeout),
    read_file: readFileTool,
    write_file: writeFileTool,
    edit_file: editFileTool,
    list_directory: listDirectoryTool,
    glob: globTool,
    grep: grepTool,
    web_fetch: webFetchTool,
    web_search: webSearchTool,
    memory_save: memorySaveTool,
    memory_search: memorySearchTool,
    claude_code: claudeCodeTool,
    vault_get: vaultGetTool,
    vault_list: vaultListTool,
  };
}

export async function runAgent(
  messages: CoreMessage[],
  config: MinicawConfig,
  options?: {
    onText?: (text: string) => void;
    onToolCall?: (toolName: string, args: unknown) => void;
  },
): Promise<{ text: string; messages: CoreMessage[] }> {
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
  const systemPrompt = buildSystemPrompt(toolNames);

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
      options?.onToolCall?.(part.toolName, part.args);
    }
  }

  const response = await result.response;

  return {
    text: fullText,
    messages: [...messages, ...response.messages],
  };
}
