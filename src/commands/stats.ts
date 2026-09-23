import type { Env } from "../config";
import { getSummary } from "../kv/store";
import { tgSendMessage } from "../telegram/api";

function formatDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function handleStats(
  message: { chat: { id: number } },
  env: Env
): Promise<void> {
  const today = formatDate(0);
  const entries = await getSummary(env.SUMMARY, today);
  const todayCount = entries.length;

  const lines: string[] = [`今日拦截 ${todayCount} 条`];

  // rolling 7-day
  for (let i = 1; i <= 7; i++) {
    const date = formatDate(-i);
    const count = (await getSummary(env.SUMMARY, date)).length;
    lines.push(`${date}: ${count} 条`);
  }

  await tgSendMessage(env, message.chat.id, lines.join("\n"));
}
