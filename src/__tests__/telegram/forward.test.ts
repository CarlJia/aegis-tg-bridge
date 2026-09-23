/**
 * forwardToOwner tests — U6
 *
 * Verifies text vs media forwarding, prefix format, and message_map write.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { forwardToOwner } from "../../telegram/forward";
import type { Env } from "../../config";
import type { TgMessage } from "../../flows/first-time";

type FetchSpy = MockInstance<Parameters<typeof globalThis.fetch>, ReturnType<typeof globalThis.fetch>>;

// ---------------------------------------------------------------------------
// Map-backed KV stub
// ---------------------------------------------------------------------------

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
    async list(_opts?: { prefix?: string }) {
      return { keys: [] };
    },
    __store: store,
  } as unknown as KVNamespace;
}

function createEnv(): Env {
  return {
    BOT_TOKEN: "test_bot_token",
    WEBHOOK_SECRET: "test_secret",
    STATE: createKV(),
    RULES: createKV(),
    SUMMARY: createKV(),
  };
}

function textMessage(chatId: number, text: string): TgMessage {
  return {
    message_id: 42,
    text,
    from: { id: chatId, username: "stranger_x" },
    chat: { id: chatId },
  };
}

function photoMessage(chatId: number, caption: string): TgMessage {
  return {
    message_id: 43,
    caption,
    from: { id: chatId, username: "stranger_y" },
    chat: { id: chatId },
  };
}

describe("forwardToOwner", () => {
  let fetchSpy: FetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("prefixes text message with [from @username · chat_id=X] and calls sendMessage", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");

    const id = await forwardToOwner("123", textMessage(123, "hello"), env);

    expect(id).toBe(777);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/bot");
    expect(url).toContain("sendMessage");
    const body = JSON.parse(opts.body as string) as { text: string; chat_id: string };
    expect(body.chat_id).toBe("999");
    expect(body.text).toContain("[from @stranger_x · chat_id=123]");
    expect(body.text).toContain("hello");
  });

  it("writes message_map entry keyed by the returned owner message_id", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");

    await forwardToOwner("123", textMessage(123, "hello"), env);

    const raw = await env.STATE.get("bot:message_map:777");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { stranger_chat_id: string };
    expect(parsed.stranger_chat_id).toBe("123");
  });

  it("uses copyMessage with the prefix in caption for media messages", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");

    await forwardToOwner("456", photoMessage(456, "look at this"), env);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("copyMessage");
    const body = JSON.parse(opts.body as string) as {
      from_chat_id: string;
      message_id: number;
      caption: string;
    };
    expect(body.from_chat_id).toBe("456");
    expect(body.message_id).toBe(43);
    expect(body.caption).toContain("[from @stranger_y · chat_id=456]");
    expect(body.caption).toContain("look at this");
  });

  it("returns null and sends nothing when no owner_chat_id is set", async () => {
    const env = createEnv();
    const id = await forwardToOwner("123", textMessage(123, "hello"), env);
    expect(id).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null and skips message_map write when Telegram API fails", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "chat not found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");

    const id = await forwardToOwner("123", textMessage(123, "hello"), env);

    expect(id).toBeNull();
    const mapped = await env.STATE.get("bot:message_map:777");
    expect(mapped).toBeNull();
  });
});
