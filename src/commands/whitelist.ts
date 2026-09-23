import type { Env } from "../config";
import { addToWhitelist } from "../kv/store";
import { assertOwner } from "./assert-owner";
import { tgSendMessage } from "../telegram/api";

export async function handleWhitelist(
  message: { chat: { id: number }; text?: string },
  env: Env
): Promise<void> {
  if (!(await assertOwner(message, env))) return;

  const parts = (message.text ?? "").split(" ").filter(Boolean);
  const chatId = parts[1];

  if (!chatId || !/^\d+$/.test(chatId)) {
    await tgSendMessage(env, message.chat.id, "用法: /whitelist <chat_id>");
    return;
  }

  await addToWhitelist(env.STATE, chatId);
  await tgSendMessage(env, message.chat.id, `已加入白名单: ${chatId}`);
}
