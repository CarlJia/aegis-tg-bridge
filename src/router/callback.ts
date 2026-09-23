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
 *  5. Forward the stranger's original message to the owner (from the stored
 *     snapshot) and register it for reply routing
 *  6. Delete the verify button message
 *  7. answerCallbackQuery("已加入白名单")
 *
 * The original message body is not carried on the callback itself, so step 5
 * replays the snapshot first-time.ts stored when it sent the button.
 */

import {
  addToWhitelist,
  deletePendingMessageId,
  getPendingMessageId,
  getOwnerChatId,
} from "../kv/store";
import { answerCallbackQuery, copyMessageToOwner, deleteMessage } from "../telegram/send";
import { registerRelayTarget } from "../telegram/forward";
import type { Env } from "../config";

interface PendingSnapshot {
  message_id?: number;
  text?: string | null;
  caption?: string | null;
}

/** Extract the displayable body from a stored pending snapshot. */
function extractSnapshotText(raw: string | null): string {
  if (!raw) return "";
  try {
    const snap = JSON.parse(raw) as PendingSnapshot;
    return snap.text ?? snap.caption ?? "";
  } catch {
    return "";
  }
}

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
  /** The message the inline keyboard is attached to (the verify prompt). */
  message?: { message_id: number };
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

  // Read the stranger's first-message snapshot BEFORE clearing it, so we can
  // forward its content to the owner (R2). Falls back to a bare notification
  // when no snapshot is available.
  const snapshotRaw = await getPendingMessageId(env.STATE, parsed_chat_id);

  // Add to whitelist
  await addToWhitelist(env.STATE, parsed_chat_id);

  // Clean up the pending button key
  await deletePendingMessageId(env.STATE, parsed_chat_id);

  // Forward the original message to the owner with the standard prefix, and
  // register it so the owner's reply can be relayed back (Bug A fix).
  const owner_chat_id = await getOwnerChatId(env.STATE);
  if (owner_chat_id) {
    const from = query.from;
    const display = from.username
      ? `@${from.username}`
      : from.first_name
        ? from.first_name
        : parsed_chat_id;
    const prefix = `[from ${display} · chat_id=${parsed_chat_id}]`;
    const originalText = extractSnapshotText(snapshotRaw);
    const body = originalText ? `${prefix}\n${originalText}` : prefix;
    const ownerMsgId = await copyMessageToOwner(
      owner_chat_id,
      parsed_chat_id,
      0,
      body,
      env,
      true
    );
    if (ownerMsgId !== null) {
      await registerRelayTarget(env.STATE, ownerMsgId, parsed_chat_id, owner_chat_id);
    }
  }

  // Remove the verify button prompt now that it has been acted on (Bug B fix).
  if (query.message) {
    await deleteMessage(parsed_chat_id, query.message.message_id, env);
  }

  // Answer the callback query with a toast
  await answerCallbackQuery(query.id, "已加入白名单", env);
}
