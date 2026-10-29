import type { Env } from "../config";
import { getOwnerChatId } from "../kv/store";

/**
 * 验证消息发送者是否为 bot owner。
 *
 * `ownerChatId` 由调用链上游（`router/message.ts` 的 classify）已经读过时传入，
 * 省掉重复的 KV 往返；不传时自己读一次。两条路径都是 fail-closed：读不到
 * owner 或读失败都返回 false。
 */
export async function assertOwner(
  message: { chat: { id: number } },
  env: Env,
  ownerChatId?: string | null
): Promise<boolean> {
  if (ownerChatId !== undefined) {
    return ownerChatId !== null && String(message.chat.id) === ownerChatId;
  }

  try {
    const ownerId = await getOwnerChatId(env.STATE);
    if (ownerId === null) return false;
    return String(message.chat.id) === ownerId;
  } catch {
    return false;
  }
}
