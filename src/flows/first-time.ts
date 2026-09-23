/**
 * First-time stranger flow — U5
 *
 * handleFirstTime(message, env)
 *
 * Logic:
 *  1. Read bot:pending_buttons:{chat_id} — if null, this is a first-time sender.
 *     In that case set the pending message_id (TTL 7 days).
 *  2. Always run the rule engine via evaluateMessage(text).
 *     If it hits, return false (U6 owns the audit).
 *  3. If pending_buttons already existed (already sent, waiting for click),
 *     do NOT send the button again — just return false.
 *  4. Otherwise call sendVerifyButton and return true.
 */

import { evaluateMessage } from "../rules/engine";
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
  const text = message.text ?? message.caption ?? "";

  // Always run the rule engine first.
  // If it hits, U6 handles the audit — we return false and do nothing else.
  const ruleResult = evaluateMessage(text);
  if (ruleResult.hit) {
    return false;
  }

  // Check whether we already have a pending button for this chat.
  const existing = await getPendingMessageId(env.STATE, chat_id);

  if (existing !== null) {
    // Button already sent; waiting for user to click — do not re-send.
    return false;
  }

  // First time: store the message_id of the incoming message as the pending one.
  // TTL 7 days — if user never clicks, the key expires naturally.
  await setPendingMessageId(env.STATE, chat_id, String(message.message_id));

  // Send the verify inline button.
  await sendVerifyButton(chat_id, env);

  return true;
}
