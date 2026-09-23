/**
 * Webhook router tests — U2
 *
 * Tests the dispatch chain: secret validation, update type routing, handler
 * invocation. Calls `handleWebhook` directly with a stubbed env to avoid the
 * @cloudflare/vitest-pool-workers `miniflare.vars` propagation complexity
 * (different miniflare versions read it differently). The dispatch logic is
 * exercised end-to-end at this layer; SELF.fetch integration is covered by
 * U9's e2e tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleWebhook } from "../../router/webhook";
import * as messageModule from "../../router/message";
import * as callbackModule from "../../router/callback";
import type { Env } from "../../config";

function getMessageCount(): number {
  return messageModule.getCalls();
}
function getCallbackCount(): number {
  return callbackModule.getCalls();
}

function createKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string | null) {
      if (value === null) store.delete(key);
      else store.set(key, value);
    },
    async delete(key: string) { store.delete(key); },
    async list(_opts?: { prefix?: string }) { return { keys: [] }; },
  } as unknown as KVNamespace;
}

function stubEnv(): Env {
  return {
    BOT_TOKEN: "test_bot_token",
    WEBHOOK_SECRET: "test_secret",
    STATE: createKV(),
    RULES: createKV(),
    SUMMARY: createKV(),
  };
}

declare const KVNamespace: never;

describe("webhook router", () => {
  beforeEach(() => {
    // Reset the in-module counters between tests so changes are observable.
    messageModule.__reset?.();
    callbackModule.__reset?.();
  });

  it("returns 401 when X-Telegram-Bot-Api-Secret-Token is missing", async () => {
    const res = await handleWebhook(
      new Request("http://test/webhook", {
        method: "POST",
        body: JSON.stringify({ update_id: 1, message: {} }),
      }),
      stubEnv()
    );
    expect(res.status).toBe(401);
    expect(getMessageCount()).toBe(0);
    expect(getCallbackCount()).toBe(0);
  });

  it("returns 401 when secret token is wrong", async () => {
    const res = await handleWebhook(
      new Request("http://test/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong_secret" },
        body: JSON.stringify({ update_id: 1, message: {} }),
      }),
      stubEnv()
    );
    expect(res.status).toBe(401);
    expect(getMessageCount()).toBe(0);
    expect(getCallbackCount()).toBe(0);
  });

  it("returns 200 and calls handleMessage for update.message", async () => {
    const res = await handleWebhook(
      new Request("http://test/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        body: JSON.stringify({
          update_id: 1,
          message: { text: "hello", chat: { id: 123 } },
        }),
      }),
      stubEnv()
    );
    expect(res.status).toBe(200);
    expect(getMessageCount()).toBe(1);
    expect(getCallbackCount()).toBe(0);
  });

  it("returns 200 and calls handleCallbackQuery for update.callback_query", async () => {
    const res = await handleWebhook(
      new Request("http://test/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        body: JSON.stringify({
          update_id: 1,
          callback_query: { id: "abc", from: { id: 123 }, data: "verify:123" },
        }),
      }),
      stubEnv()
    );
    expect(res.status).toBe(200);
    expect(getMessageCount()).toBe(0);
    expect(getCallbackCount()).toBe(1);
  });

  it("returns 200 and calls handleMessage for update.edited_message", async () => {
    const res = await handleWebhook(
      new Request("http://test/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        body: JSON.stringify({
          update_id: 1,
          edited_message: { text: "edited hello", chat: { id: 123 } },
        }),
      }),
      stubEnv()
    );
    expect(res.status).toBe(200);
    expect(getMessageCount()).toBe(1);
    expect(getCallbackCount()).toBe(0);
  });

  it("returns 200 for unknown update types", async () => {
    const res = await handleWebhook(
      new Request("http://test/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        body: JSON.stringify({ update_id: 1, inline_query: {} }),
      }),
      stubEnv()
    );
    expect(res.status).toBe(200);
    expect(getMessageCount()).toBe(0);
    expect(getCallbackCount()).toBe(0);
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await handleWebhook(
      new Request("http://test/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        body: "not-json",
      }),
      stubEnv()
    );
    expect(res.status).toBe(400);
    expect(getMessageCount()).toBe(0);
    expect(getCallbackCount()).toBe(0);
  });
});
