/**
 * 解析 owner 命令的目标 chat_id。
 *
 * 支持两种写法：`/cmd <chat_id>` 直接给，或 reply 一条转发消息让命令自己
 * 反查。转发给 owner 的每条消息都由 `registerRelayTarget` 登记在
 * `bot:message_map` 里（reply 透传查的是同一张表），所以 reply 形态不需要参数。
 */

import type { Env } from "../config";
import { lookupMessageMap } from "../kv/store";
import type { CommandMessage } from "../telegram/types";

export type TargetResolution =
  | { ok: true; chatId: string; fromReply: boolean }
  | { ok: false; hint: string };

/**
 * @param command 不带斜杠的命令名，用于拼提示语（如 `block`、`unblock`）。
 */
export async function resolveCommandTarget(
  message: CommandMessage,
  env: Env,
  command: string
): Promise<TargetResolution> {
  const usage = `/${command} <chat_id>`;
  const parts = (message.text ?? "").split(" ").filter(Boolean);
  const explicit = parts[1];

  // 显式参数优先。给了但不合法就报用法，不改用 reply 上下文 —— 静默忽略
  // 显式输入比报错更危险。
  if (explicit !== undefined) {
    if (!/^\d+$/.test(explicit)) return { ok: false, hint: `用法: ${usage}` };
    return { ok: true, chatId: explicit, fromReply: false };
  }

  if (message.reply_to_message === undefined) {
    return {
      ok: false,
      hint: `用法: ${usage}（也可以 reply 一条转发消息,自动识别该会话）`,
    };
  }

  const lookup = await lookupMessageMap(
    env.STATE,
    String(message.reply_to_message.message_id)
  );
  if (lookup.status !== "ok") {
    return {
      ok: false,
      hint: `无法从被回复的消息解析 chat_id(回复的不是转发消息,或已超过 30 天回复窗口),请使用: ${usage}`,
    };
  }

  return { ok: true, chatId: lookup.entry.stranger_chat_id, fromReply: true };
}
