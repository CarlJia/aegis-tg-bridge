import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleStart } from "../../commands/start";
import { getOwnerChatId } from "../../kv/store";

describe("handleStart", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  // vi.spyOn(globalThis, 'fetch') returns a fetch-specific MockInstance that
  // is not assignable to Vitest's internal MockInstance<unknown[],unknown>.
  // Cast through unknown to align the type.
  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
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

  it("writes owner_chat_id on first /start", async () => {
    const msg = { chat: { id: 999 } };
    await handleStart(msg, env as Parameters<typeof handleStart>[1]);
    const ownerId = await getOwnerChatId(stateKv);
    expect(ownerId).toBe("999");
  });

  it("reply message includes welcome strings", async () => {
    const msg = { chat: { id: 999 } };
    await handleStart(msg, env as Parameters<typeof handleStart>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("欢迎");
    expect(body.text).toContain("命令清单");
    expect(body.text).toContain("/block");
  });

  it("calls TG fetch exactly once", async () => {
    const msg = { chat: { id: 999 } };
    await handleStart(msg, env as Parameters<typeof handleStart>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
