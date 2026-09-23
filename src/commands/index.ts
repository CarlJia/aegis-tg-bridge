import type { Env } from "../config";
import { getOwnerChatId } from "../kv/store";
import { handleStart } from "./start";
import { handleStats } from "./stats";
import { handleSettings } from "./settings";
import { handleBlock } from "./block";
import { handleRevoke } from "./revoke";
import { handleWhitelist } from "./whitelist";

// 每个 handler 内部已做 assertOwner 检查（defense in depth），
// dispatch 的 owner gate 是第一道防线。
export async function dispatch(
  message: { chat: { id: number }; text?: string },
  env: Env
): Promise<void> {
  const ownerId = await getOwnerChatId(env.STATE);
  if (ownerId === null || String(message.chat.id) !== ownerId) {
    // 非 owner 静默忽略
    return;
  }

  const cmd = (message.text ?? "").split(" ")[0];

  switch (cmd) {
    case "/start":
      await handleStart(message, env);
      break;
    case "/stats":
      await handleStats(message, env);
      break;
    case "/settings":
      await handleSettings(message, env);
      break;
    case "/block":
      await handleBlock(message, env);
      break;
    case "/revoke":
      await handleRevoke(message, env);
      break;
    case "/whitelist":
      await handleWhitelist(message, env);
      break;
    default:
      // 未知命令静默忽略
      break;
  }
}
