import type { Env } from "../config";
import { getUserSettings } from "../kv/store";
import { tgSendMessage } from "./_tg";

export async function handleSettings(
  message: { chat: { id: number } },
  env: Env
): Promise<void> {
  const ownerId = String(message.chat.id);
  const settings = await getUserSettings(env.STATE, ownerId);

  const timezone = settings?.timezone ?? "Asia/Shanghai";
  const summaryTimeHour = settings?.summaryTimeHour ?? 22;

  const text = [
    `<b>当前设置</b>`,
    `时区: ${timezone}`,
    `摘要推送时间: ${summaryTimeHour}:00`,
    ``,
    `说明: 每日 ${summaryTimeHour}:00（${timezone}）会收到当日拦截摘要。`,
    // U9: inline keyboard for +1h / -1h can be added here
  ].join("\n");

  await tgSendMessage(env, message.chat.id, text);
}
