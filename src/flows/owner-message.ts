/**
 * Owner-message flow — U7
 *
 * Distinguishes owner reply (relayed to the addressed stranger) from a bare
 * message (prompted with a "please reply to a specific message" notice).
 */

import { relayToStranger, promptReplyToSpecific } from "../telegram/relay";
import type { Env } from "../config";
import type { TgMessage } from "../flows/first-time";

interface OwnerMessage extends TgMessage {
  reply_to_message?: { message_id: number };
}

/**
 * Handle a non-command message from the owner.
 *   - Reply present → relay to the addressed stranger (R4, R5)
 *   - No reply → prompt the owner (R5)
 */
export async function handleOwnerMessage(
  message: TgMessage,
  env: Env
): Promise<void> {
  const ownerMessage = message as OwnerMessage;

  if (ownerMessage.reply_to_message) {
    await relayToStranger(ownerMessage, env);
    return;
  }

  await promptReplyToSpecific(message.chat.id, env);
}
