/**
 * Callback query handler — U5
 *
 * Handles `update.callback_query` with `data` of form `verify:{chat_id}`.
 *
 * Security (KTD9): verifies callback_query.from.id matches parsed chat_id
 * before writing to whitelist.
 *
 * Flow:
 *  1. Parse data = "verify:{chat_id}"
 *  2. SECURITY CHECK: from.id === parsed_chat_id
 *  3. addToWhitelist(parsed_chat_id)
 *  4. deletePendingMessageId(parsed_chat_id)
 *  5. Send a small notification to owner (see note below)
 *  6. answerCallbackQuery("已加入白名单")
 *
 * NOTE on forwarding the original pending message:
 * The original message body is not available in a webhook callback request.
 * Telegram does not re-send the full message object with the callback_query —
 * it only sends callback_query.id, from, and data. Re-fetching via getMessages
 * would require an extra API call and adds complexity. Instead we send a small
 * notification to the owner noting the new whitelist addition.
 */

import { addToWhitelist, deletePendingMessageId } from "../kv/store";
import { answerCallbackQuery, copyMessageToOwner } from "../telegram/send";
import type { Env } from "../config";

// ---------------------------------------------------------------------------
// Test seam — track calls so U2's existing tests continue to pass
// ---------------------------------------------------------------------------

let _calls = 0;
export function getCalls(): number {
  return _calls;
}
export function __reset(): void {
  _calls = 0;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TgCallbackQuery {
  id: string;
  from: { id: number; username?: string; first_name?: string };
  data?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleCallbackQuery(
  query: TgCallbackQuery,
  env: Env
): Promise<void> {
  _calls++;

  const data = query.data;
  if (!data) return;

  // Parse data = "verify:{chat_id}"
  const match = data.match(/^verify:(\d+)$/);
  if (!match) return; // unknown callback format — ignore

  const parsed_chat_id = match[1];

  // KTD9 CRITICAL SECURITY CHECK
  if (query.from.id !== Number(parsed_chat_id)) {
    console.warn(
      `[callback] forged callback rejected: from.id=${query.from.id} != chat_id=${parsed_chat_id}`
    );
    await answerCallbackQuery(query.id, undefined, env);
    return;
  }

  // Add to whitelist
  await addToWhitelist(env.STATE, parsed_chat_id);

  // Clean up the pending button key
  await deletePendingMessageId(env.STATE, parsed_chat_id);

  // Get owner_chat_id for the notification
  const owner_chat_id = await env.STATE.get("bot:owner_chat_id");
  if (owner_chat_id) {
    const from = query.from;
    const display =
      from.username
        ? `@${from.username}`
        : from.first_name
          ? from.first_name
          : parsed_chat_id;
    const prefix = `新联系人已加入白名单: ${display} · chat_id=${parsed_chat_id}`;
    await copyMessageToOwner(
      owner_chat_id,
      parsed_chat_id,
      0,
      prefix,
      env,
      true // isText: send as plain text notification
    );
  }

  // Answer the callback query with a toast
  await answerCallbackQuery(query.id, "已加入白名单", env);
}
