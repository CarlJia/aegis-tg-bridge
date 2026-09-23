import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleStats } from "../../commands/stats";
import { pushSummary } from "../../kv/store";
import type { SummaryEntry } from "../../kv/store";

describe("handleStats", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const summaryKv = env.SUMMARY as KVNamespace;
  const stateKv = env.STATE as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  function todayStr(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  beforeEach(async () => {
    await summaryKv.delete(`bot:summary_queue:${todayStr()}`);
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      await summaryKv.delete(`bot:summary_queue:${yyyy}-${mm}-${dd}`);
    }
    mockFetch = vi.spyOn(globalThis, "fetch") as unknown as ReturnType<typeof vi.spyOn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  it("returns today's block count in the reply", async () => {
    const entry: SummaryEntry = {
      ts: Date.now(),
      chat_id: "111",
      snippet: "usdt 搬砖",
      rule_hit: "keywords",
      has_media: false,
    };
    await pushSummary(summaryKv, todayStr(), entry);

    const msg = { chat: { id: 999 } };
    await handleStats(msg, env as Parameters<typeof handleStats>[1]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("今日拦截");
    expect(body.text).toContain("1 条");
  });

  it("calls TG fetch exactly once", async () => {
    const msg = { chat: { id: 999 } };
    await handleStats(msg, env as Parameters<typeof handleStats>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
