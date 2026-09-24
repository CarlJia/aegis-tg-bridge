import type { Env } from "../config";
import {
  getRules,
  setRules,
  deleteRules,
} from "../kv/store";
import { DEFAULT_RULES, resolveRules } from "../rules/default";
import { assertOwner } from "./assert-owner";
import { tgSendMessage } from "../telegram/api";

const USAGE = [
  "用法:",
  "/rules list — 查看当前屏蔽词",
  "/rules add <词> — 添加屏蔽词",
  "/rules del <词> — 删除屏蔽词",
  "/rules reset — 恢复默认屏蔽词",
].join("\n");

/** Telegram HTML parse_mode 下，回显用户输入前必须转义，否则 < > & 会让发送被拒。 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function handleRules(
  message: { chat: { id: number }; text?: string },
  env: Env
): Promise<void> {
  if (!(await assertOwner(message, env))) return;

  const parts = (message.text ?? "").split(" ").filter(Boolean);
  const sub = parts[1];
  const keyword = parts.slice(2).join(" ");

  switch (sub) {
    case "list": {
      const payload = await getRules(env.RULES);
      const keywords = resolveRules(payload).keywords;
      const source = Array.isArray(payload?.keywords) ? "KV 覆盖" : "代码默认";

      // 逐条累加而非整体 slice，避免截断在 HTML 标签中间导致发送失败。
      const lines: string[] = [];
      let truncated = false;
      for (const k of keywords) {
        const line = `• ${escapeHtml(k)}`;
        if (lines.join("\n").length + line.length > 3500) {
          truncated = true;
          break;
        }
        lines.push(line);
      }
      const body = lines.length ? lines.join("\n") : "（空，未启用关键词拦截）";
      const tail = truncated ? `\n…（仅显示前 ${lines.length} 个）` : "";

      await tgSendMessage(
        env,
        message.chat.id,
        `<b>屏蔽词</b>（来源: ${source}，共 ${keywords.length} 个）\n${body}${tail}`
      );
      return;
    }

    case "add": {
      if (!keyword.trim()) {
        await tgSendMessage(env, message.chat.id, "用法: /rules add <词>");
        return;
      }
      const payload = (await getRules(env.RULES)) ?? {};
      const current = resolveRules(payload).keywords;
      if (current.includes(keyword)) {
        await tgSendMessage(env, message.chat.id, `已存在: ${escapeHtml(keyword)}`);
        return;
      }
      const next = [...current, keyword];
      await setRules(env.RULES, { ...payload, keywords: next });
      await tgSendMessage(
        env,
        message.chat.id,
        `已添加: ${escapeHtml(keyword)}（当前 ${next.length} 个，来源: KV）`
      );
      return;
    }

    case "del": {
      if (!keyword.trim()) {
        await tgSendMessage(env, message.chat.id, "用法: /rules del <词>");
        return;
      }
      const payload = (await getRules(env.RULES)) ?? {};
      const current = resolveRules(payload).keywords;
      if (!current.includes(keyword)) {
        await tgSendMessage(env, message.chat.id, `未找到: ${escapeHtml(keyword)}`);
        return;
      }
      const next = current.filter((k) => k !== keyword);
      await setRules(env.RULES, { ...payload, keywords: next });
      const note = next.length === 0 ? "（已清空，不再按关键词拦截）" : "";
      await tgSendMessage(
        env,
        message.chat.id,
        `已删除: ${escapeHtml(keyword)}（当前 ${next.length} 个，来源: KV）${note}`
      );
      return;
    }

    case "reset": {
      await deleteRules(env.RULES);
      await tgSendMessage(
        env,
        message.chat.id,
        `已恢复默认屏蔽词（${DEFAULT_RULES.keywords.length} 个）`
      );
      return;
    }

    default:
      await tgSendMessage(env, message.chat.id, USAGE);
      return;
  }
}
