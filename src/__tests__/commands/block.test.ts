import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleBlock } from "../../commands/block";
import { setOwnerChatId, addToBlacklist, getBlacklist } from "../../kv/store";

describe("handleBlock", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
    await stateKv.delete("bot:blacklist");
    await setOwnerChatId(stateKv, "999");
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

  it("invalid chat_id ('abc') replies usage message", async () => {
    const msg = { chat: { id: 999 }, text: "/block abc" };
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("用法");
  });

  it("valid chat_id calls addToBlacklist and replies confirmation", async () => {
    const msg = { chat: { id: 999 }, text: "/block 111" };
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);

    const list = await getBlacklist(stateKv);
    expect(list).toContain("111");

    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("已加入黑名单");
  });

  it("calls TG fetch exactly once on success", async () => {
    const msg = { chat: { id: 999 }, text: "/block 222" };
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
