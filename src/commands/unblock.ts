import type { Env } from "../config";
import { removeFromBlacklist } from "../kv/store";
import { assertOwner } from "./assert-owner";
import { resolveCommandTarget } from "./resolve-target";
import { tgSendMessage } from "../telegram/api";
import type { CommandMessage } from "../telegram/types";

export async function handleUnblock(
  message: CommandMessage,
  env: Env,
  ownerChatId?: string | null
): Promise<void> {
  if (!(await assertOwner(message, env, ownerChatId))) return;

  const target = await resolveCommandTarget(message, env, "unblock");
  if (!target.ok) {
    await tgSendMessage(env, message.chat.id, target.hint);
    return;
  }

  await removeFromBlacklist(env.STATE, target.chatId);
  const suffix = target.fromReply ? "（取自被回复的消息）" : "";
  await tgSendMessage(
    env,
    message.chat.id,
    `已移出黑名单: ${target.chatId}${suffix}`
  );
}
