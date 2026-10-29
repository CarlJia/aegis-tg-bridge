/**
 * Shared Telegram payload types.
 */

/** Minimal shape of an incoming Telegram message we rely on. */
export interface TgMessage {
  message_id: number;
  text?: string;
  caption?: string;
  from?: { id: number; username?: string; first_name?: string };
  chat: { id: number; type?: string };
  date?: number;
  /** 被回复的那条消息 —— owner 用 reply 定位「是哪一条转发消息」。 */
  reply_to_message?: { message_id: number };
}

/**
 * `bot:message_map:{owner_message_id}` 里的一条记录:owner 侧的转发消息
 * 对应哪个陌生人会话。
 */
export interface MessageMap {
  stranger_chat_id: string;
  owner_chat_id: string;
  expires_at: number;
}

/** Owner 命令的入参形状:命令文本 + 可选的 reply 上下文。 */
export type CommandMessage = Pick<
  TgMessage,
  "chat" | "text" | "reply_to_message"
>;
