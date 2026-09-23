/**
 * relay tests — U7
 *
 * Verifies the owner-reply → stranger relay path: message_map lookup, media
 * vs text dispatch, no-bot-signature behavior, and the no-mapping fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { relayToStranger } from "../../telegram/relay";
import type { Env } from "../../config";
import type { TgMessage } from "../../flows/first-time";

type FetchSpy = MockInstance<Parameters<typeof globalThis.fetch>, ReturnType<typeof globalThis.fetch>>;

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

/** Seed a message_map entry the way U6's forwardToOwner writes it. */
async function seedMap(env: Env, ownerMsgId: number, strangerChatId: string) {
  await env.STATE.put(
    `bot:message_map:${ownerMsgId}`,
    JSON.stringify({
      stranger_chat_id: strangerChatId,
      owner_chat_id: "999",
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    })
  );
}

describe("relayToStranger", () => {
  let fetchSpy: FetchSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("relays owner text to the mapped stranger via sendMessage with no forward header", async () => {
    const env = createEnv();
    await seedMap(env, 777, "123");

    const reply = {
      message_id: 900,
      text: "收到,明天下午",
      chat: { id: 999 },
      reply_to_message: { message_id: 777 },
    } as TgMessage & { reply_to_message: { message_id: number } };

    const target = await relayToStranger(reply, env);

    expect(target).toBe("123");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("sendMessage");
    expect(url).not.toContain("forwardMessage");
    expect(url).not.toContain("copyMessage");
    const body = JSON.parse(opts.body as string) as { chat_id: string; text: string };
    expect(body.chat_id).toBe("123");
    expect(body.text).toBe("收到,明天下午");
  });

  it("relays owner photo replies via sendPhoto (no forward header)", async () => {
    const env = createEnv();
    await seedMap(env, 777, "123");

    const reply = {
      message_id: 901,
      caption: "看这个",
      chat: { id: 999 },
      reply_to_message: { message_id: 777 },
      photo: [{ file_id: "small" }, { file_id: "large" }],
    };

    const target = await relayToStranger(reply as never, env);

    expect(target).toBe("123");
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("sendPhoto");
    const body = JSON.parse(opts.body as string) as { chat_id: string; photo: string };
    expect(body.chat_id).toBe("123");
    expect(body.photo).toBe("large");
  });

  it("notifies the owner and returns null when the message_map entry is missing", async () => {
    const env = createEnv();

    const reply = {
      message_id: 902,
      text: "hello",
      chat: { id: 999 },
      reply_to_message: { message_id: 888 },
    };

    const target = await relayToStranger(reply as never, env);

    expect(target).toBeNull();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("sendMessage");
    const body = JSON.parse(opts.body as string) as { chat_id: number; text: string };
    expect(body.chat_id).toBe(999);
    expect(body.text).toContain("找不到对应的陌生人");
  });

  it("returns null with no Telegram call when the message has no reply_to_message", async () => {
    const env = createEnv();
    const bare = { message_id: 903, text: "hi", chat: { id: 999 } };
    const target = await relayToStranger(bare as never, env);
    expect(target).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces a corrupted mapping as a prompt instead of relaying", async () => {
    const env = createEnv();
    await env.STATE.put("bot:message_map:777", "not-json");
    const reply = {
      message_id: 904,
      text: "hello",
      chat: { id: 999 },
      reply_to_message: { message_id: 777 },
    };
    const target = await relayToStranger(reply as never, env);
    expect(target).toBeNull();
    const body = JSON.parse(
      (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string
    ) as { text: string };
    expect(body.text).toContain("回复映射已损坏");
  });
});
