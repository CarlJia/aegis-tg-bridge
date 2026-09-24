/**
 * Centralized Telegram Bot API calls — U6
 *
 * Wraps fetch against https://api.telegram.org/bot{env.BOT_TOKEN}/...
 * All functions fail silently (log on error) and never throw.
 */

import type { Env } from "../config";

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function tgFetch<T>(
  endpoint: string,
  body: Record<string, unknown>,
  env: Env
): Promise<T | null> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${endpoint}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as TgResponse<T>;
    if (!res.ok || !data.ok) {
      console.warn(`[tg] ${endpoint} failed: ${res.status} ${data.description ?? ""}`);
      return null;
    }
    return data.result ?? null;
  } catch (err) {
    console.warn(`[tg] ${endpoint} network error:`, err);
    return null;
  }
}

/**
 * Low-level Bot API call. Returns the `result` payload or null on failure.
 * Exported so sibling modules (send.ts) share one fetch path.
 */
export const tgCall = tgFetch;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a plain text message. Returns the new message_id, or null on failure.
 * Fails silently.
 */
export async function tgSendMessage(
  env: Env,
  chatId: number | string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<number | null> {
  const result = await tgFetch<{ message_id: number }>(
    "sendMessage",
    { chat_id: chatId, text, parse_mode: parseMode },
    env
  );
  return result?.message_id ?? null;
}

/**
 * Register the bot command menu for a single chat (scope = chat).
 * Scoping to the owner's chat keeps the "/" menu invisible to everyone else.
 * Fails silently.
 */
export async function setBotCommands(
  env: Env,
  chatId: number | string,
  commands: { command: string; description: string }[]
): Promise<void> {
  await tgFetch(
    "setMyCommands",
    { commands, scope: { type: "chat", chat_id: chatId } },
    env
  );
}

/**
 * Copy a message (preserves all content: photo, document, video, etc.)
 * and return the new message_id on success.
 * Fails silently — returns null on error.
 */
export async function tgCopyMessage(
  env: Env,
  sourceChatId: number | string,
  targetChatId: number | string,
  messageId: number,
  caption?: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<number | null> {
  const body: Record<string, unknown> = {
    chat_id: targetChatId,
    from_chat_id: sourceChatId,
    message_id: messageId,
  };
  if (caption !== undefined) {
    body.caption = caption;
    body.parse_mode = parseMode;
  }
  const result = await tgFetch<{ message_id: number }>("copyMessage", body, env);
  return result?.message_id ?? null;
}

/**
 * Send a photo with an optional caption.
 * Fails silently.
 */
export async function tgSendPhoto(
  env: Env,
  chatId: number | string,
  photo: string, // file_id or URL
  caption?: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, photo };
  if (caption !== undefined) {
    body.caption = caption;
    body.parse_mode = parseMode;
  }
  await tgFetch("sendPhoto", body, env);
}

/**
 * Send a document with an optional caption.
 * Fails silently.
 */
export async function tgSendDocument(
  env: Env,
  chatId: number | string,
  document: string, // file_id or URL
  caption?: string,
  parseMode: "HTML" | "Markdown" = "HTML"
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, document };
  if (caption !== undefined) {
    body.caption = caption;
    body.parse_mode = parseMode;
  }
  await tgFetch("sendDocument", body, env);
}
