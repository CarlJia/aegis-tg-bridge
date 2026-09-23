/**
 * Owner reply relay — U7
 *
 * Owner replies to a Bot-forwarded message (whose message_id is registered in
 * `bot:message_map:{owner_message_id}`); we look up the target stranger's
 * chat_id and relay the owner's content, with NO bot signature (no forward
 * header) so the stranger sees a normal human reply.
 *
 * KTD6 / R4: use sendMessage / sendPhoto / sendDocument, never forwardMessage
 * (forwardMessage and copyMessage both add a forwarded-from header).
 */

import { getMessageMap } from "../kv/store";
import { tgSendMessage, tgSendPhoto, tgSendDocument } from "./api";
import type { Env } from "../config";
import type { TgMessage } from "../flows/first-time";

interface MessageMap {
  stranger_chat_id: string;
  owner_chat_id: string;
  expires_at: number;
}

/**
 * Minimal reply shape used to detect owner's reply target. Telegram populates
 * `reply_to_message` when the owner uses the native reply UI.
 */
interface OwnerRelayMessage extends TgMessage {
  reply_to_message?: { message_id: number };
  photo?: Array<{ file_id: string }>;
  document?: { file_id: string };
}

/**
 * Relay the owner's message to the stranger it replies to.
 * Returns the resolved stranger chat_id on success, or null when no mapping
 * exists (the owner gets a "not found" notice in that case).
 */
export async function relayToStranger(
  message: OwnerRelayMessage,
  env: Env
): Promise<string | null> {
  const repliedId = message.reply_to_message?.message_id;
  if (repliedId === undefined) {
    return null;
  }

  const raw = await getMessageMap(env.STATE, String(repliedId));
  if (!raw) {
    await tgSendMessage(
      env,
      message.chat.id,
      "找不到对应的陌生人(可能已超过 30 天回复窗口)"
    );
    return null;
  }

  let parsed: MessageMap;
  try {
    parsed = JSON.parse(raw) as MessageMap;
  } catch {
    await tgSendMessage(env, message.chat.id, "回复映射已损坏,请重新 reply 一条近期消息");
    return null;
  }

  const target = parsed.stranger_chat_id;
  const text = message.text;
  const caption =
    text && text.length > 0
      ? text
      : (message as unknown as { caption?: string }).caption;

  // Dispatch by owner's message type. Owner replies are echoed with the same
  // kind of Telegram call, so the stranger receives a plain message from the
  // Bot account with no forwarded-from metadata.
  if (message.photo && message.photo.length > 0) {
    const fileId = message.photo[message.photo.length - 1]!.file_id;
    await tgSendPhoto(env, target, fileId, caption);
  } else if (message.document) {
    await tgSendDocument(env, target, message.document.file_id, caption);
  } else {
    await tgSendMessage(env, target, caption ?? "");
  }

  return target;
}

/**
 * Prompt the owner to use reply when they send a bare message.
 */
export async function promptReplyToSpecific(
  ownerChatId: number | string,
  env: Env
): Promise<void> {
  await tgSendMessage(env, ownerChatId, "请 reply 到具体陌生人消息");
}
