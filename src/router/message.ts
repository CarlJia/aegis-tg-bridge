/**
 * Message handler — U6
 *
 * Complete routing logic:
 *  1. isOwner?          → commands.dispatch
 *  2. isWhitelisted?    → forwardToOwner (U6) + record message_map
 *  3. isBlacklisted?    → silent return
 *  4. rules.hit?        → pushSummary + silent return  (R6, R7, R8)
 *  5. else              → handleFirstTime (button flow, U5)
 */

import { evaluateMessage } from "../rules/engine";
import { dispatch } from "../commands/index";
import { handleFirstTime } from "../flows/first-time";
import { handleOwnerMessage } from "../flows/owner-message";
import { forwardToOwner } from "../telegram/forward";
import {
  getOwnerChatId,
  getWhitelist,
  getBlacklist,
  pushSummary,
} from "../kv/store";
import type { Env } from "../config";
import type { TgMessage } from "../flows/first-time";

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

type Route =
  | { type: "command" }
  | { type: "owner" }
  | { type: "whitelisted" }
  | { type: "blacklisted" }
  | { type: "rules_hit"; rule: string }
  | { type: "first_time" };

async function classify(msg: TgMessage, env: Env): Promise<Route> {
  const chatIdStr = String(msg.chat.id);
  const text = msg.text ?? "";

  // The three lookups are independent — read them together rather than
  // paying three sequential KV round-trips on every inbound message.
  const [blacklist, ownerId, whitelist] = await Promise.all([
    getBlacklist(env.STATE),
    getOwnerChatId(env.STATE),
    getWhitelist(env.STATE),
  ]);

  // 1) Blacklisted → silent, even for command text.
  if (blacklist.includes(chatIdStr)) {
    return { type: "blacklisted" };
  }

  // 2) Slash commands → dispatch. Dispatch gates owner-only commands and
  //    handles the `/start` ownership bootstrap.
  if (text.startsWith("/")) {
    return { type: "command" };
  }

  // 3) Owner (non-command message)?
  if (ownerId !== null && chatIdStr === ownerId) {
    return { type: "owner" };
  }

  // 4) Whitelisted → forward.
  if (whitelist.includes(chatIdStr)) {
    return { type: "whitelisted" };
  }

  // 5) Rule engine hit?
  const result = evaluateMessage(msg.text ?? msg.caption ?? "");
  if (result.hit) {
    return { type: "rules_hit", rule: result.rule! };
  }

  // 6) First time (or pending button click).
  return { type: "first_time" };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function handleMessage(
  message: TgMessage,
  env: Env
): Promise<void> {
  const route = await classify(message, env);

  switch (route.type) {
    case "command": {
      await dispatch(message, env);
      return;
    }

    case "owner": {
      // Owner non-command message: reply relay (U7) or bare-message prompt.
      await handleOwnerMessage(message, env);
      return;
    }

    case "whitelisted": {
      // Forward to owner and register reply mapping
      await forwardToOwner(String(message.chat.id), message, env);
      return;
    }

    case "blacklisted": {
      // Silent — R8: no reply, no audit, no whitelist change
      return;
    }

    case "rules_hit": {
      // R7: write to summary_queue, silent return (R8)
      const chatIdStr = String(message.chat.id);
      const text = (message.text ?? message.caption ?? "").slice(0, 200);
      await pushSummary(env.STATE, todayDate(), {
        ts: Date.now(),
        chat_id: chatIdStr,
        snippet: text,
        rule_hit: route.rule,
        has_media: message.caption !== undefined || message.text === undefined,
      });
      return;
    }

    case "first_time": {
      // handleFirstTime returns true if button was sent, false otherwise.
      // R6: rules already evaluated before reaching here (handled above).
      // R1: button sent for clean first-time message.
      await handleFirstTime(message, env);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
