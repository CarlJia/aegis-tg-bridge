import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleRevoke } from "../../commands/revoke";
import { setOwnerChatId, addToWhitelist, getWhitelist } from "../../kv/store";

describe("handleRevoke", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
    await stateKv.delete("bot:whitelist");
    await setOwnerChatId(stateKv, "999");
    await addToWhitelist(stateKv, "111");
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
    const msg = { chat: { id: 999 }, text: "/revoke abc" };
    await handleRevoke(msg, env as Parameters<typeof handleRevoke>[1]);
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("用法");
  });

  it("valid chat_id removes from whitelist and replies confirmation", async () => {
    const msg = { chat: { id: 999 }, text: "/revoke 111" };
    await handleRevoke(msg, env as Parameters<typeof handleRevoke>[1]);

    const list = await getWhitelist(stateKv);
    expect(list).not.toContain("111");

    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("已从白名单移除");
  });

  it("calls TG fetch exactly once on success", async () => {
    const msg = { chat: { id: 999 }, text: "/revoke 111" };
    await handleRevoke(msg, env as Parameters<typeof handleRevoke>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
