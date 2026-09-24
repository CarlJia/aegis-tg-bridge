import type { Env } from "../config";
import { setOwnerChatId } from "../kv/store";
import { setBotCommands, tgSendMessage } from "../telegram/api";

const WELCOME = `欢迎使用 Aegis TG Bridge！

我是你的双向桥机器人，可以帮助你管理陌生人消息、广告拦截和每日摘要。

<b>命令清单：</b>
/stats - 查看拦截统计
/settings - 查看/修改设置
/block &lt;chat_id&gt; - 将目标加入黑名单
/revoke &lt;chat_id&gt; - 从白名单移除目标
/whitelist &lt;chat_id&gt; - 手动将目标加入白名单
/rules - 管理屏蔽词（list / add / del / reset）`;

// Telegram 命令菜单。仅注册到 owner 的会话（scope = chat），其他人点 "/" 看不到；
// 命令本身另有 owner gate（dispatch + assertOwner），双重限制"仅本人可用"。
const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: "start", description: "初始化并绑定为 owner" },
  { command: "stats", description: "查看拦截统计" },
  { command: "settings", description: "查看当前设置" },
  { command: "rules", description: "管理屏蔽词（list/add/del/reset）" },
  { command: "block", description: "将目标加入黑名单" },
  { command: "revoke", description: "从白名单移除目标" },
  { command: "whitelist", description: "手动将目标加入白名单" },
];

export async function handleStart(
  message: { chat: { id: number } },
  env: Env
): Promise<void> {
  await setOwnerChatId(env.STATE, String(message.chat.id));
  await setBotCommands(env, message.chat.id, BOT_COMMANDS);
  await tgSendMessage(env, message.chat.id, WELCOME);
}
