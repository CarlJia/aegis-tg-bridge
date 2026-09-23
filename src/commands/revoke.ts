import type { Env } from "../config";
import { removeFromWhitelist } from "../kv/store";
import { assertOwner } from "./assert-owner";
import { tgSendMessage } from "../telegram/api";

export async function handleRevoke(
  message: { chat: { id: number }; text?: string },
  env: Env
): Promise<void> {
  if (!(await assertOwner(message, env))) return;

  const parts = (message.text ?? "").split(" ").filter(Boolean);
  const chatId = parts[1];

  if (!chatId || !/^\d+$/.test(chatId)) {
    await tgSendMessage(env, message.chat.id, "用法: /revoke <chat_id>");
    return;
  }

  await removeFromWhitelist(env.STATE, chatId);
  await tgSendMessage(env, message.chat.id, `已从白名单移除: ${chatId}`);
}
