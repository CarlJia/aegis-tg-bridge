import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleWhitelist } from "../../commands/whitelist";
import { setOwnerChatId, getWhitelist } from "../../kv/store";

describe("handleWhitelist", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
    await stateKv.delete("bot:whitelist");
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

  it("invalid chat_id replies usage message", async () => {
    const msg = { chat: { id: 999 }, text: "/whitelist abc" };
    await handleWhitelist(msg, env as Parameters<typeof handleWhitelist>[1]);
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("用法");
  });

  it("valid chat_id adds to whitelist and replies confirmation", async () => {
    const msg = { chat: { id: 999 }, text: "/whitelist 555" };
    await handleWhitelist(msg, env as Parameters<typeof handleWhitelist>[1]);

    const list = await getWhitelist(stateKv);
    expect(list).toContain("555");

    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("已加入白名单");
  });

  it("calls TG fetch exactly once on success", async () => {
    const msg = { chat: { id: 999 }, text: "/whitelist 666" };
    await handleWhitelist(msg, env as Parameters<typeof handleWhitelist>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
