import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleSettings } from "../../commands/settings";
import { setUserSettings } from "../../kv/store";

describe("handleSettings", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await stateKv.delete("bot:user_settings:999");
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

  it("reply contains timezone and summaryTimeHour", async () => {
    await setUserSettings(stateKv, "999", {
      timezone: "Asia/Shanghai",
      summaryTimeHour: 22,
    });

    const msg = { chat: { id: 999 } };
    await handleSettings(msg, env as Parameters<typeof handleSettings>[1]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("时区");
    expect(body.text).toContain("22:00");
  });

  it("calls TG fetch exactly once", async () => {
    const msg = { chat: { id: 999 } };
    await handleSettings(msg, env as Parameters<typeof handleSettings>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
