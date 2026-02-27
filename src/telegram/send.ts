import type { Bot } from "grammy";
import { markdownToTelegramHtml, chunkText } from "./format.js";

const PARSE_ERR_RE = /can't parse entities|parse entities|find end of the entity/i;

/**
 * Send a potentially long text message to a Telegram chat.
 * Converts markdown to Telegram HTML, chunks at 4096 chars,
 * and falls back to plain text if HTML parsing fails.
 */
export async function sendResponse(
  bot: Bot,
  chatId: number,
  text: string,
  replyToMessageId?: number,
): Promise<void> {
  const html = markdownToTelegramHtml(text);
  const chunks = chunkText(html, 4096);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    try {
      await bot.api.sendMessage(chatId, chunk, {
        parse_mode: "HTML",
        ...(i === 0 && replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      });
    } catch (err) {
      // If HTML parsing fails, retry with plain text
      if (err instanceof Error && PARSE_ERR_RE.test(err.message)) {
        const plainChunks = chunkText(text, 4096);
        const plainChunk = plainChunks[i] ?? chunk;
        await bot.api.sendMessage(chatId, plainChunk, {
          ...(i === 0 && replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
        });
      } else {
        throw err;
      }
    }
  }
}
