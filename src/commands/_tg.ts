import type { Env } from "../config";

/**
 * 向 Telegram 发送纯文本消息（HTML parse_mode）。
 * 仅记录失败，不抛出异常。
 */
export async function tgSendMessage(
  env: Env,
  chatId: number | string,
  text: string
): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      console.error(`[tg] sendMessage failed ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[tg] sendMessage exception:", err);
  }
}
