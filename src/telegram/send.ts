/**
 * Telegram send helpers — U5
 *
 * Thin wrappers over the shared Bot API call in `api.ts`.
 * All functions fail silently (log on error, never throw).
 */

import { tgCall } from "./api";
import type { Env } from "../config";

/**
 * Send the "please confirm" inline button to a stranger's chat.
 * Fails silently.
 */
export async function sendVerifyButton(
  chat_id: number | string,
  env: Env
): Promise<void> {
  await tgCall(
    "sendMessage",
    {
      chat_id,
      text: "请先确认您是本人后我们继续沟通。",
      reply_markup: {
        inline_keyboard: [
          [{ text: "我确认是本人", callback_data: `verify:${chat_id}` }],
        ],
      },
    },
    env
  );
}

/**
 * Answer a callback query (dismiss the loading spinner).
 * Optional alert text may be passed to show a toast. Fails silently.
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
  await tgCall("answerCallbackQuery", body, env);
}

/**
 * Notify the owner of a whitelist addition (text path) or copy a media
 * message with the prefix in its caption. Never adds a forward header.
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
    await tgCall("sendMessage", { chat_id: owner_chat_id, text: prefix }, env);
  } else {
    await tgCall(
      "copyMessage",
      {
        chat_id: owner_chat_id,
        from_chat_id: source_chat_id,
        message_id,
        caption: prefix,
      },
      env
    );
  }
}
