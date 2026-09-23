import type { Env } from "../config";
import { addToBlacklist } from "../kv/store";
import { assertOwner } from "./assert-owner";
import { tgSendMessage } from "./_tg";

export async function handleBlock(
  message: { chat: { id: number }; text?: string },
  env: Env
): Promise<void> {
  if (!(await assertOwner(message, env))) return;

  const parts = (message.text ?? "").split(" ").filter(Boolean);
  const chatId = parts[1];

  if (!chatId || !/^\d+$/.test(chatId)) {
    await tgSendMessage(env, message.chat.id, "用法: /block <chat_id>");
    return;
  }

  await addToBlacklist(env.STATE, chatId);
  await tgSendMessage(env, message.chat.id, `已加入黑名单: ${chatId}`);
}
