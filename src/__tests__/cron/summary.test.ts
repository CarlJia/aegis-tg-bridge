/**
 * Cron summary tests — U8
 *
 * Verifies local-hour computation, digest push at the owner's configured hour
 * (and silence outside it), idempotency, and cleanup of old summary keys.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import { handleCron, localHour } from "../../cron/summary";
import { cleanupOldSummaries } from "../../cron/cleanup";
import type { Env } from "../../config";

type FetchSpy = MockInstance<Parameters<typeof globalThis.fetch>, ReturnType<typeof globalThis.fetch>>;

interface FakeKV extends KVNamespace {
  __store: Map<string, string>;
}

function createKV(): FakeKV {
  const store = new Map<string, string>();
  const kv = {
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
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
    __store: store,
  };
  return kv as unknown as FakeKV;
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

describe("localHour", () => {
  it("returns 22 for Asia/Shanghai when UTC is 14:00", () => {
    const now = new Date("2026-09-23T14:00:00Z");
    expect(localHour("Asia/Shanghai", now)).toBe(22);
  });

  it("returns 21 for America/New_York when UTC is 02:00 (EDT)", () => {
    // 2026-09-23 is within US DST, so New York is UTC-4 → 02:00Z = 22:00 local.
    const now = new Date("2026-09-23T02:00:00Z");
    expect(localHour("America/New_York", now)).toBe(22);
  });

  it("returns null for an unusable timezone string", () => {
    expect(localHour("Not/AZone", new Date("2026-09-23T14:00:00Z"))).toBeNull();
  });
});

describe("handleCron", () => {
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

  it("pushes a digest when the owner's local hour matches (Covers AE3, R7)", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");
    await env.STATE.put(
      "bot:user_settings:999",
      JSON.stringify({ timezone: "Asia/Shanghai", summaryTimeHour: 22 })
    );
    await env.STATE.put(
      "bot:summary_queue:2026-09-23",
      JSON.stringify([{ ts: 1, chat_id: "z", snippet: "usdt", rule_hit: "keywords", has_media: false }])
    );

    await handleCron(env, new Date("2026-09-23T14:00:00Z"));

    const calls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("sendMessage"));
    expect(calls).toHaveLength(1);
    const body = JSON.parse((calls[0] as [string, RequestInit])[1].body as string) as {
      chat_id: string;
      text: string;
    };
    expect(body.chat_id).toBe("999");
    expect(body.text).toContain("今日拦截 1 条");
  });

  it("does not push outside the configured hour", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");
    await env.STATE.put(
      "bot:user_settings:999",
      JSON.stringify({ timezone: "Asia/Shanghai", summaryTimeHour: 22 })
    );

    // 06:30Z → Asia/Shanghai 14:30 — a different local hour from 22.
    await handleCron(env, new Date("2026-09-23T06:30:00Z"));

    const calls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("sendMessage"));
    expect(calls).toHaveLength(0);
  });

  it("skips the push when the day's digest was already sent (idempotency)", async () => {
    const env = createEnv();
    await env.STATE.put("bot:owner_chat_id", "999");
    await env.STATE.put(
      "bot:user_settings:999",
      JSON.stringify({ timezone: "Asia/Shanghai", summaryTimeHour: 22 })
    );
    await env.STATE.put("bot:last_summary:999:2026-09-23", String(Date.now()));

    await handleCron(env, new Date("2026-09-23T14:05:00Z"));

    const calls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("sendMessage"));
    expect(calls).toHaveLength(0);
  });

  it("does nothing (no TG call) when no owner is configured but still cleans up", async () => {
    const env = createEnv();
    await handleCron(env, new Date("2026-09-23T14:00:00Z"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sweeps old summary keys at most once per UTC day", async () => {
    const env = createEnv();
    await env.STATE.put("bot:summary_queue:2026-09-01", "[]");

    // First tick of the day performs the sweep.
    await handleCron(env, new Date("2026-09-23T01:00:00Z"));
    expect(await env.STATE.get("bot:summary_queue:2026-09-01")).toBeNull();

    // A stale key recreated later the same day must survive the next tick —
    // the sweep is gated to one run per UTC day.
    await env.STATE.put("bot:summary_queue:2026-09-01", "[]");
    await handleCron(env, new Date("2026-09-23T02:00:00Z"));
    expect(await env.STATE.get("bot:summary_queue:2026-09-01")).not.toBeNull();

    // The next UTC day sweeps again.
    await handleCron(env, new Date("2026-09-24T01:00:00Z"));
    expect(await env.STATE.get("bot:summary_queue:2026-09-01")).toBeNull();
  });
});

describe("cleanupOldSummaries", () => {
  it("deletes keys older than the retention window and keeps recent ones", async () => {
    const kv = createKV();
    await kv.put("bot:summary_queue:2026-09-14", "[]"); // 9 days before 09-23
    await kv.put("bot:summary_queue:2026-09-22", "[]"); // yesterday
    await kv.put("bot:summary_queue:2026-09-23", "[]"); // today

    const deleted = await cleanupOldSummaries(kv, new Date("2026-09-23T14:00:00Z"));

    expect(deleted).toContain("bot:summary_queue:2026-09-14");
    expect(deleted).not.toContain("bot:summary_queue:2026-09-22");
    expect(deleted).not.toContain("bot:summary_queue:2026-09-23");
    expect(await kv.get("bot:summary_queue:2026-09-22")).not.toBeNull();
  });
});
