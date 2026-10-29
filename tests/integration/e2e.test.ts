/**
 * End-to-end integration tests — U9
 *
 * Drives the real Worker entry points (`handleWebhook`, `handleCron`) through
 * complete user journeys with real routing logic and a Map-backed KV. The only
 * thing mocked is the outbound Telegram HTTP call, captured for assertions.
 *
 * Scenarios:
 *   1. Verify → forward → reply relay (F1 + F3, R1–R4, AE2 + AE4)
 *   2. Spam interception → daily digest (F2, R6–R8, AE3)
 *   3. Bare owner message fallback (R5, AE5)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { handleWebhook } from "../../src/router/webhook";
import { handleCron } from "../../src/cron/summary";
import type { Env } from "../../src/config";

type FetchSpy = MockInstance<Parameters<typeof globalThis.fetch>, ReturnType<typeof globalThis.fetch>>;

// ---------------------------------------------------------------------------
// Test doubles
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
    async list(opts?: { prefix?: string }) {
      const prefix = opts?.prefix ?? "";
      return {
        keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
        cursor: undefined,
      };
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

const SECRET = "test_secret";

/** Build a webhook POST carrying the given update. */
function update(env: Env, body: unknown): Promise<Response> {
  return handleWebhook(
    new Request("http://test/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET },
      body: JSON.stringify(body),
    }),
    env
  );
}

/** All sendMessage/copyMessage calls captured, with parsed bodies. */
interface Captured {
  endpoint: string;
  body: Record<string, unknown>;
}

function sentMessages(spy: FetchSpy): Captured[] {
  return spy.mock.calls.map(([url, opts]) => {
    const u = String(url);
    const endpoint = u.slice(u.lastIndexOf("/") + 1);
    return { endpoint, body: JSON.parse((opts as RequestInit).body as string) as Record<string, unknown> };
  });
}

/** 转发给 owner 的消息在 message_map 里登记的 owner 侧 message_id。 */
async function forwardedOwnerMessageId(env: Env): Promise<number> {
  const mapKeys = await env.STATE.list({ prefix: "bot:message_map:" });
  expect(mapKeys.keys).toHaveLength(1);
  return Number(mapKeys.keys[0]!.name.slice("bot:message_map:".length));
}

describe("end-to-end journeys", () => {
  let fetchSpy: FetchSpy;
  let msgIdCounter: number;

  beforeEach(() => {
    msgIdCounter = 100;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, result: { message_id: msgIdCounter++ } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("F1 + F3: stranger verifies, message forwards, owner reply relays back (AE2, AE4)", async () => {
    const env = createEnv();

    // Owner binds with /start.
    await update(env, {
      update_id: 1,
      message: { message_id: 1, text: "/start", chat: { id: 999 }, from: { id: 999 } },
    });

    // Stranger X sends first message → gets verify button, nothing forwarded.
    await update(env, {
      update_id: 2,
      message: {
        message_id: 2,
        text: "你好,想谈合作",
        chat: { id: 123 },
        from: { id: 123, username: "stranger_x" },
      },
    });
    const afterFirst = sentMessages(fetchSpy);
    const toX = afterFirst.filter((m) => String(m.body.chat_id) === "123");
    expect(toX).toHaveLength(1);
    expect(JSON.stringify(toX[0]!.body)).toContain("我确认是本人");

    // X clicks verify → original message forwarded, verify prompt deleted,
    // and the forward registered so the owner can reply to it.
    fetchSpy.mockClear();
    await update(env, {
      update_id: 3,
      callback_query: {
        id: "cb1",
        from: { id: 123 },
        data: "verify:123",
        message: { message_id: 500 },
      },
    });
    expect(await env.STATE.get("bot:whitelist")).toContain("123");

    // The verify button prompt is deleted from X's chat.
    const deletes = sentMessages(fetchSpy).filter((m) => m.endpoint === "deleteMessage");
    expect(deletes).toHaveLength(1);
    expect(String(deletes[0]!.body.chat_id)).toBe("123");
    expect(deletes[0]!.body.message_id).toBe(500);

    // The verify-time forward is registered in message_map (regression: it was
    // missing, so replying to it failed with "找不到对应的陌生人").
    const forwardedId = await forwardedOwnerMessageId(env);

    // Owner replies to the verify-time forward → relayed to X.
    fetchSpy.mockClear();
    await update(env, {
      update_id: 4,
      message: {
        message_id: 4,
        text: "可以,下午三点",
        chat: { id: 999 },
        from: { id: 999 },
        reply_to_message: { message_id: forwardedId },
      },
    });
    const relayCalls = sentMessages(fetchSpy).filter((m) => String(m.body.chat_id) === "123");
    expect(relayCalls).toHaveLength(1);
    expect(relayCalls[0]!.endpoint).toBe("sendMessage");
    expect(relayCalls[0]!.body.text).toBe("可以,下午三点");

    // A subsequent whitelisted message still forwards with the prefix.
    fetchSpy.mockClear();
    await update(env, {
      update_id: 5,
      message: {
        message_id: 5,
        text: "明天有空吗",
        chat: { id: 123 },
        from: { id: 123, username: "stranger_x" },
      },
    });
    const followUps = sentMessages(fetchSpy).filter((m) => String(m.body.chat_id) === "999");
    expect(followUps).toHaveLength(1);
    expect(String(followUps[0]!.body.text)).toContain("[from @stranger_x · chat_id=123]");
  });

  it("F2: spam is intercepted, audited, and summarized on the next cron tick (AE3)", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");
    await env.STATE.put(
      "bot:user_settings:999",
      JSON.stringify({ timezone: "Asia/Shanghai", summaryTimeHour: 22 })
    );

    // Spam arrives from a stranger who never verified.
    await update(env, {
      update_id: 1,
      message: {
        message_id: 1,
        text: "usdt 搬砖日入过千 https://bit.ly/promo",
        chat: { id: 777 },
        from: { id: 777, username: "spammer" },
      },
    });

    // No Telegram call reached the owner or the spammer for the spam payload.
    const duringSpam = sentMessages(fetchSpy).filter(
      (m) => String(m.body.chat_id) === "999" || String(m.body.chat_id) === "777"
    );
    expect(duringSpam).toHaveLength(0);

    // 入站消息按「当天」写队列,所以键和下面的 cron 注入都必须跟着当天走,
    // 否则这个用例第二天开始必红。
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    const queue = await env.STATE.get(`bot:summary_queue:${today}`);
    expect(queue).not.toBeNull();

    // Cron tick at the owner's local 22:00 (= 14:00Z on the same calendar day).
    fetchSpy.mockClear();
    await handleCron(env, new Date(`${today}T14:00:00Z`));
    const digest = sentMessages(fetchSpy).filter((m) => m.body.chat_id === "999");
    expect(digest).toHaveLength(1);
    expect(String(digest[0]!.body.text)).toContain("今日拦截 1 条");
  });

  it("R6: /rules hot-reloads a custom keyword; /rules reset restores defaults", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");

    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    const queueKey = `bot:summary_queue:${today}`;

    // Owner adds a custom keyword → persisted to the RULES namespace.
    await update(env, {
      update_id: 1,
      message: { message_id: 1, text: "/rules add 测试暗号", chat: { id: 999 }, from: { id: 999 } },
    });
    expect(await env.RULES.get("bot:rules")).toContain("测试暗号");

    // A stranger sending it is intercepted and audited.
    await update(env, {
      update_id: 2,
      message: { message_id: 2, text: "测试暗号 快来", chat: { id: 555 }, from: { id: 555, username: "s" } },
    });
    expect(await env.STATE.get(queueKey)).toContain("keywords");

    // Owner resets → override key removed.
    await update(env, {
      update_id: 3,
      message: { message_id: 3, text: "/rules reset", chat: { id: 999 }, from: { id: 999 } },
    });
    expect(await env.RULES.get("bot:rules")).toBeNull();

    // The same text from another stranger is no longer keyword-intercepted.
    await update(env, {
      update_id: 4,
      message: { message_id: 4, text: "测试暗号 快来", chat: { id: 556 }, from: { id: 556, username: "s2" } },
    });
    expect(await env.STATE.get(queueKey)).not.toContain("556");
  });

  it("reply '/block' without argument blacklists the replied stranger", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");
    await env.STATE.put("bot:whitelist", JSON.stringify(["123"]));

    await update(env, {
      update_id: 1,
      message: {
        message_id: 2,
        text: "在吗",
        chat: { id: 123 },
        from: { id: 123, username: "stranger_x" },
      },
    });
    const forwardedId = await forwardedOwnerMessageId(env);

    fetchSpy.mockClear();
    await update(env, {
      update_id: 2,
      message: {
        message_id: 3,
        text: "/block",
        chat: { id: 999 },
        from: { id: 999 },
        reply_to_message: { message_id: forwardedId },
      },
    });

    expect(await env.STATE.get("bot:blacklist")).toContain("123");

    const receipts = sentMessages(fetchSpy).filter((m) => String(m.body.chat_id) === "999");
    expect(receipts).toHaveLength(1);
    expect(String(receipts[0]!.body.text)).toContain("已加入黑名单");
    expect(String(receipts[0]!.body.text)).toContain("123");
  });

  it("reply '/unblock' restores normal inbound handling for the conversation", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");
    await env.STATE.put("bot:blacklist", JSON.stringify(["123"]));

    // Blocked: the stranger's message is dropped silently.
    await update(env, {
      update_id: 1,
      message: {
        message_id: 2,
        text: "在吗",
        chat: { id: 123 },
        from: { id: 123, username: "stranger_x" },
      },
    });
    expect(sentMessages(fetchSpy)).toHaveLength(0);

    // Owner lifts the block explicitly (the stranger was never forwarded, so
    // there is no message to reply to here).
    await update(env, {
      update_id: 2,
      message: {
        message_id: 3,
        text: "/unblock 123",
        chat: { id: 999 },
        from: { id: 999 },
      },
    });
    expect(await env.STATE.get("bot:blacklist")).not.toContain("123");

    // The same stranger is handled normally again — they get the verify button.
    fetchSpy.mockClear();
    await update(env, {
      update_id: 3,
      message: {
        message_id: 4,
        text: "在吗",
        chat: { id: 123 },
        from: { id: 123, username: "stranger_x" },
      },
    });
    const toStranger = sentMessages(fetchSpy).filter(
      (m) => String(m.body.chat_id) === "123"
    );
    expect(toStranger).toHaveLength(1);
    expect(JSON.stringify(toStranger[0]!.body)).toContain("我确认是本人");
  });

  it("R5: a bare owner message prompts for a reply and reaches no stranger (AE5)", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");

    fetchSpy.mockClear();
    await update(env, {
      update_id: 1,
      message: { message_id: 1, text: "在吗", chat: { id: 999 }, from: { id: 999 } },
    });

    const calls = sentMessages(fetchSpy);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.chat_id).toBe(999);
    expect(String(calls[0]!.body.text)).toContain("请 reply 到具体陌生人消息");
  });
});
