/**
 * Forward a stranger's message to the owner with a prefix, and register
 * the reply mapping so owner can later reply via message_map.
 *
 * prefix = "[from @{username} · chat_id={chat_id}]"
 *
 * TTL 30 days for message_map entries (reply window).
 */

import { getOwnerChatId, setMessageMap } from "../kv/store";
import { tgSendMessage, tgCopyMessage } from "./api";
import type { Env } from "../config";
import type { TgMessage } from "./types";

/** Build the "[from @X · chat_id=Y]" prefix string. */
function buildPrefix(chat_id: string, from?: { username?: string; first_name?: string }): string {
  const display =
    from?.username
      ? `@${from.username}`
      : from?.first_name
        ? from.first_name
        : "unknown";
  return `[from ${display} · chat_id=${chat_id}]`;
}

export async function forwardToOwner(
  stranger_chat_id: string,
  message: TgMessage,
  env: Env
): Promise<number | null> {
  const owner_chat_id = await getOwnerChatId(env.STATE);
  if (!owner_chat_id) {
    console.warn("[forward] no owner_chat_id set — skipping forward");
    return null;
  }

  const prefix = buildPrefix(stranger_chat_id, message.from);
  const text = message.text;
  const caption = message.caption;

  let ownerMsgId: number | null = null;

  if (text !== undefined) {
    // Text message — prepend prefix; tgSendMessage returns the new message_id.
    ownerMsgId = await tgSendMessage(env, owner_chat_id, prefix + "\n" + text);
  } else if (caption !== undefined) {
    // Media with caption — copyMessage preserves content, prefix in caption
    ownerMsgId = await tgCopyMessage(
      env,
      stranger_chat_id,
      owner_chat_id,
      message.message_id,
      prefix + "\n" + caption
    );
  } else {
    // Media without caption — copyMessage with just prefix in caption
    ownerMsgId = await tgCopyMessage(
      env,
      stranger_chat_id,
      owner_chat_id,
      message.message_id,
      prefix
    );
  }

  if (ownerMsgId !== null) {
    // Write message_map: owner_msg_id → stranger_chat_id
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
    const mapValue = JSON.stringify({
      stranger_chat_id,
      owner_chat_id,
      expires_at: expiresAt,
    });
    await setMessageMap(env.STATE, String(ownerMsgId), mapValue);
  }

  return ownerMsgId;
}

