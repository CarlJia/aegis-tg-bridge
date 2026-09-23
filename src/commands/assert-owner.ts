import type { Env } from "../config";
import { getOwnerChatId } from "../kv/store";

/**
 * 验证消息发送者是否为 bot owner。
 * 读取 `bot:owner_chat_id` 与 message.chat.id 比对。
 * 若 KV 不可用或未设置，返回 false（fail-closed）。
 */
export async function assertOwner(
  message: { chat: { id: number } },
  env: Env
): Promise<boolean> {
  try {
    const ownerId = await getOwnerChatId(env.STATE);
    if (ownerId === null) return false;
    return String(message.chat.id) === ownerId;
  } catch {
    return false;
  }
}
