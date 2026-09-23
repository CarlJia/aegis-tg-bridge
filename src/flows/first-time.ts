/**
 * First-time stranger flow — U5
 *
 * Called only from the `first_time` route in router/message.ts, after the
 * router's classify() has already run the rule engine and found no hit — so
 * this function does not re-evaluate rules.
 *
 * Logic:
 *  1. Read bot:pending_buttons:{chat_id} — if already set, the verify button
 *     was already sent; do nothing.
 *  2. Otherwise store a message snapshot, send the verify button, return true.
 */

import {
  getPendingMessageId,
  setPendingMessageId,
} from "../kv/store";
import { sendVerifyButton } from "../telegram/send";
import type { Env } from "../config";
import type { TgMessage } from "../telegram/types";

export type { TgMessage };

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleFirstTime(
  message: TgMessage,
  env: Env
): Promise<boolean> {
  const chat_id = String(message.chat.id);

  // Check whether we already have a pending button for this chat.
  const existing = await getPendingMessageId(env.STATE, chat_id);
  if (existing !== null) {
    // Button already sent; waiting for user to click — do not re-send.
    return false;
  }

  // First time: remember a snapshot of the message so the verify callback can
  // forward its content to the owner (R2). The webhook callback does not carry
  // the original message body, so the snapshot is what makes the forward work.
  const snapshot = JSON.stringify({
    message_id: message.message_id,
    text: message.text ?? null,
    caption: message.caption ?? null,
  });
  await setPendingMessageId(env.STATE, chat_id, snapshot);

  // Send the verify inline button.
  await sendVerifyButton(chat_id, env);

  return true;
}
