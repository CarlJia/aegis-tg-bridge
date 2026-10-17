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

const COPY_TEXT_MAX_BYTES = 256;
const UTF8_ENCODER = new TextEncoder();

/**
 * Inline keyboard with a single one-tap "copy" button whose payload is the
 * stranger's message alone — never the "[from ...]" prefix, which the owner
 * has no reason to copy. Returns undefined when there is no body to copy, or
 * when it exceeds Telegram's `copy_text` limit (the API rejects the whole send
 * in that case, so the button is dropped rather than truncated).
 *
 * The limit is measured in UTF-8 bytes: Telegram documents `copy_text` as
 * "1-256 characters" but its sibling `callback_data` as "1-64 bytes", and the
 * check lives in closed-source core, so the unit is unverified. Bytes <= 256
 * implies characters <= 256 under either reading, so a CJK body over ~85
 * characters loses only the button, never the forward.
 */
export function buildCopyMarkup(
  body: string
): { inline_keyboard: { text: string; copy_text: { text: string } }[][] } | undefined {
  if (body.length === 0 || UTF8_ENCODER.encode(body).length > COPY_TEXT_MAX_BYTES)
    return undefined;
  return {
    inline_keyboard: [[{ text: "📋 复制原文", copy_text: { text: body } }]],
  };
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
  const copyMarkup = buildCopyMarkup(text ?? caption ?? "");

  let ownerMsgId: number | null = null;

  if (text !== undefined) {
    // Text message — prepend prefix; tgSendMessage returns the new message_id.
    ownerMsgId = await tgSendMessage(env, owner_chat_id, prefix + "\n" + text, {
      replyMarkup: copyMarkup,
    });
  } else if (caption !== undefined) {
    // Media with caption — copyMessage preserves content, prefix in caption
    ownerMsgId = await tgCopyMessage(
      env,
      stranger_chat_id,
      owner_chat_id,
      message.message_id,
      prefix + "\n" + caption,
      { replyMarkup: copyMarkup }
    );
  } else {
    // Media without caption — copyMessage with just prefix in caption
    ownerMsgId = await tgCopyMessage(
      env,
      stranger_chat_id,
      owner_chat_id,
      message.message_id,
      prefix,
      { replyMarkup: copyMarkup }
    );
  }

  if (ownerMsgId !== null) {
    await registerRelayTarget(env.STATE, ownerMsgId, stranger_chat_id, owner_chat_id);
  }

  return ownerMsgId;
}

/**
 * Record that a message delivered to the owner (`ownerMessageId`) should relay
 * back to `strangerChatId` when the owner replies to it. TTL 30 days — the
 * reply window. Shared by the normal forward path and the verify-time forward.
 */
export async function registerRelayTarget(
  kv: KVNamespace,
  ownerMessageId: number,
  strangerChatId: string,
  ownerChatId: string
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const mapValue = JSON.stringify({
    stranger_chat_id: strangerChatId,
    owner_chat_id: ownerChatId,
    expires_at: expiresAt,
  });
  await setMessageMap(kv, String(ownerMessageId), mapValue);
}

