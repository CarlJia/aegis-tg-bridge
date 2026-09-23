import type { Env } from "../config";
import { setOwnerChatId } from "../kv/store";
import { tgSendMessage } from "../telegram/api";

const WELCOME = `欢迎使用 Aegis TG Bridge！

我是你的双向桥机器人，可以帮助你管理陌生人消息、广告拦截和每日摘要。

<b>命令清单：</b>
/stats - 查看拦截统计
/settings - 查看/修改设置
/block &lt;chat_id&gt; - 将目标加入黑名单
/revoke &lt;chat_id&gt; - 从白名单移除目标
/whitelist &lt;chat_id&gt; - 手动将目标加入白名单`;

export async function handleStart(
  message: { chat: { id: number } },
  env: Env
): Promise<void> {
  await setOwnerChatId(env.STATE, String(message.chat.id));
  await tgSendMessage(env, message.chat.id, WELCOME);
}
