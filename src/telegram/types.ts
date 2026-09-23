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
}
