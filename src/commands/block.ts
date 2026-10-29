import type { Env } from "../config";
import { addToBlacklist, getMessageMap } from "../kv/store";
import { assertOwner } from "./assert-owner";
import { tgSendMessage } from "../telegram/api";
import type { CommandMessage, MessageMap } from "../telegram/types";

/**
 * 从被回复的消息里解析要屏蔽的 chat_id。
 *
 * 转发给 owner 的每条消息都用 `registerRelayTarget`（forward.ts）登记到
 * `bot:message_map:{owner_message_id}`，reply 透传（relay.ts）查的是同一张表；
 * 这里复用同一份数据，owner reply `/block` 不带参数也能定位到要屏蔽的会话。
 * 映射有 30 天 TTL，查不到说明回复的不是转发消息，或已超过回复窗口。
 */
async function resolveRepliedChatId(
  message: CommandMessage,
  env: Env
): Promise<string | null> {
  const repliedId = message.reply_to_message?.message_id;
  if (repliedId === undefined) return null;

  const raw = await getMessageMap(env.STATE, String(repliedId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<MessageMap>;
    return parsed.stranger_chat_id ?? null;
  } catch {
    return null;
  }
}

export async function handleBlock(
  message: CommandMessage,
  env: Env
): Promise<void> {
  if (!(await assertOwner(message, env))) return;

  const parts = (message.text ?? "").split(" ").filter(Boolean);
  const explicit = parts[1];

  if (explicit !== undefined) {
    if (!/^\d+$/.test(explicit)) {
      await tgSendMessage(env, message.chat.id, "用法: /block <chat_id>");
      return;
    }
    await addToBlacklist(env.STATE, explicit);
    await tgSendMessage(env, message.chat.id, `已加入黑名单: ${explicit}`);
    return;
  }

  const replied = await resolveRepliedChatId(message, env);
  if (replied === null) {
    const hint =
      message.reply_to_message === undefined
        ? "用法: /block <chat_id>（也可以 reply 一条转发消息,自动屏蔽该会话）"
        : "无法从被回复的消息解析 chat_id(回复的不是转发消息,或已超过 30 天回复窗口),请使用: /block <chat_id>";
    await tgSendMessage(env, message.chat.id, hint);
    return;
  }

  await addToBlacklist(env.STATE, replied);
  await tgSendMessage(
    env,
    message.chat.id,
    `已加入黑名单: ${replied}（取自被回复的消息）`
  );
}
