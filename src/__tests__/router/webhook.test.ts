/**
 * Webhook router tests — U2
 *
 * Covers secret validation and update-type dispatch. The two downstream
 * handlers are mocked so this file asserts routing alone; their real behavior
 * is covered by message.test.ts and callback.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleWebhook } from "../../router/webhook";
import type { Env } from "../../config";

const { mockHandleMessage, mockHandleCallbackQuery } = vi.hoisted(() => ({
  mockHandleMessage: vi.fn(async () => {}),
  mockHandleCallbackQuery: vi.fn(async () => {}),
}));

vi.mock("../../router/message", () => ({ handleMessage: mockHandleMessage }));
vi.mock("../../router/callback", () => ({ handleCallbackQuery: mockHandleCallbackQuery }));

function createKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string | null) {
      if (value === null) store.delete(key);
      else store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [] };
    },
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

function webhookRequest(headers: Record<string, string>, body: unknown): Request {
  return new Request("http://test/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("webhook router", () => {
  beforeEach(() => {
    mockHandleMessage.mockClear();
    mockHandleCallbackQuery.mockClear();
  });

  it("returns 401 when X-Telegram-Bot-Api-Secret-Token is missing", async () => {
    const res = await handleWebhook(webhookRequest({}, { update_id: 1, message: {} }), stubEnv());
    expect(res.status).toBe(401);
    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleCallbackQuery).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret token is wrong", async () => {
    const res = await handleWebhook(
      webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": "wrong_secret" }, { update_id: 1, message: {} }),
      stubEnv()
    );
    expect(res.status).toBe(401);
    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleCallbackQuery).not.toHaveBeenCalled();
  });

  it("routes update.message to handleMessage", async () => {
    const res = await handleWebhook(
      webhookRequest(
        { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        { update_id: 1, message: { message_id: 1, text: "hello", chat: { id: 123 } } }
      ),
      stubEnv()
    );
    expect(res.status).toBe(200);
    expect(mockHandleMessage).toHaveBeenCalledTimes(1);
    expect(mockHandleCallbackQuery).not.toHaveBeenCalled();
  });

  it("routes update.callback_query to handleCallbackQuery", async () => {
    const res = await handleWebhook(
      webhookRequest(
        { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        { update_id: 1, callback_query: { id: "abc", from: { id: 123 }, data: "verify:123" } }
      ),
      stubEnv()
    );
    expect(res.status).toBe(200);
    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it("routes update.edited_message through handleMessage", async () => {
    const res = await handleWebhook(
      webhookRequest(
        { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        { update_id: 1, edited_message: { message_id: 1, text: "edited", chat: { id: 123 } } }
      ),
      stubEnv()
    );
    expect(res.status).toBe(200);
    expect(mockHandleMessage).toHaveBeenCalledTimes(1);
  });

  it("returns 200 and dispatches nothing for unknown update types", async () => {
    const res = await handleWebhook(
      webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": "test_secret" }, { update_id: 1, inline_query: {} }),
      stubEnv()
    );
    expect(res.status).toBe(200);
    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockHandleCallbackQuery).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid JSON body", async () => {
    const res = await handleWebhook(
      new Request("http://test/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "test_secret" },
        body: "not-json",
      }),
      stubEnv()
    );
    expect(res.status).toBe(400);
    expect(mockHandleMessage).not.toHaveBeenCalled();
  });
});
