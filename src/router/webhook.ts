/**
 * Telegram Webhook Router — U2
 *
 * Validates X-Telegram-Bot-Api-Secret-Token header, parses the incoming update,
 * and dispatches to the appropriate handler by update type.
 */

import type { Env } from "../config";
import type { TgMessage } from "../flows/first-time";
import { handleMessage } from "./message";
import { handleCallbackQuery } from "./callback";

// ---------------------------------------------------------------------------
// Constant-time secret comparison
// ---------------------------------------------------------------------------

/**
 * Compares two strings in constant time (via timingSafeEqual).
 * Returns false if lengths differ (without throwing), otherwise compares bytes.
 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) {
    return false;
  }
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  // timingSafeEqual requires both ArrayBuffers to have the same byte length
  const result = crypto.subtle.timingSafeEqual(aBuf, bBuf);
  // timingSafeEqual returns a Uint8Array or ArrayBuffer; await the Promise
  const boolResult = await result;
  // The result of timingSafeEqual is a boolean-like value; convert safely
  return Boolean(boolResult);
}

// ---------------------------------------------------------------------------
// Telegram update type shapes (subset)
// ---------------------------------------------------------------------------

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
  // other fields are possible but unused for now
}

interface TgCallbackQuery {
  id: string;
  from: { id: number };
  data?: string;
}

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------

export async function handleWebhook(req: Request, env: Env): Promise<Response> {
  // Read body as text (needed for KV later; must consume before returning)
  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch {
    return new Response(null, { status: 400 });
  }

  // Secret validation
  const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!secret) {
    return new Response(null, { status: 401 });
  }
  const valid = await safeEqual(secret, env.WEBHOOK_SECRET);
  if (!valid) {
    return new Response(null, { status: 401 });
  }

  // Parse JSON
  let update: TgUpdate;
  try {
    update = JSON.parse(bodyText) as TgUpdate;
  } catch {
    return new Response(null, { status: 400 });
  }

  // Dispatch by update type
  if (update.message) {
    await handleMessage(update.message, env);
  } else if (update.edited_message) {
    // edited messages still route through the same message handler
    await handleMessage(update.edited_message, env);
  } else if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  } else {
    // Other update types: log and return 200 without dispatching
    console.log("[webhook] unhandled update type:", JSON.stringify(update));
  }

  return new Response(null, { status: 200 });
}
