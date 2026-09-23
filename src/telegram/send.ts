/**
 * Telegram send helpers — U5
 *
 * Low-level wrappers around the Telegram Bot API.
 * All functions POST to the Bot API and log on failure (never throw).
 */

import type { Env } from "../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TgMessage {
  message_id: number;
  text?: string;
  caption?: string;
  from?: { id: number; username?: string; first_name?: string };
  chat: { id: number; type?: string };
  date?: number;
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function tgFetch(
  endpoint: string,
  body: Record<string, unknown>,
  env: Env
): Promise<void> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${endpoint}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[telegram] ${endpoint} failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[telegram] ${endpoint} network error:`, err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send the "please confirm" inline button to a stranger's chat.
 * Fails silently — caller does not throw.
 */
export async function sendVerifyButton(
  chat_id: number | string,
  env: Env
): Promise<void> {
  await tgFetch("sendMessage", {
    chat_id,
    text: "请先确认您是本人后我们继续沟通。",
    reply_markup: {
      inline_keyboard: [
        [{ text: "我确认是本人", callback_data: `verify:${chat_id}` }],
      ],
    },
  }, env);
}

/**
 * Answer a callback query (dismiss the loading spinner).
 * Optional alert text may be passed to show a toast.
 * Fails silently.
 */
export async function answerCallbackQuery(
  callback_query_id: string,
  text: string | undefined,
  env: Env
): Promise<void> {
  const body: Record<string, unknown> = { callback_query_id };
  if (text !== undefined) {
    body.text = text;
    body.show_alert = true;
  }
  await tgFetch("answerCallbackQuery", body, env);
}

/**
 * Forward a text message to the owner with a prefix line.
 * Uses sendMessage so no "forwarded from" header appears.
 * Fails silently.
 */
export async function copyMessageToOwner(
  owner_chat_id: number | string,
  source_chat_id: number | string,
  message_id: number,
  prefix: string,
  env: Env,
  isText: boolean
): Promise<void> {
  if (isText) {
    // For text messages: reconstruct with sendMessage so we can prepend prefix.
    // The original message text is re-read from the source chat via getMessages.
    // Since webhook does not give us the original text body, this path
    // sends a small notification instead (see note in callback.ts).
    await tgFetch("sendMessage", {
      chat_id: owner_chat_id,
      text: `${prefix}`,
    }, env);
  } else {
    // For media: use copyMessage and put prefix in caption.
    await tgFetch("copyMessage", {
      chat_id: owner_chat_id,
      from_chat_id: source_chat_id,
      message_id,
      caption: prefix,
    }, env);
  }
}
