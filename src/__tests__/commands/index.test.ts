import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { dispatch } from "../../commands/index";
import { setOwnerChatId, getBlacklist, getWhitelist } from "../../kv/store";

describe("dispatch", () => {
  // ctx created before use so KV proxies are initialized
  // @ts-ignore
  const ctx = createExecutionContext();
  // @ts-ignore
  let stateKv: KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // @ts-ignore
    stateKv = env.STATE as KVNamespace;
    await stateKv.delete("bot:owner_chat_id");
    await stateKv.delete("bot:blacklist");
    await stateKv.delete("bot:whitelist");
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

  it("unknown command is silently ignored (no reply)", async () => {
    await setOwnerChatId(stateKv, "999");
    const msg = { chat: { id: 999 }, text: "/foo" };
    await dispatch(msg, env as Parameters<typeof dispatch>[1]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("/start from owner invokes start handler", async () => {
    await setOwnerChatId(stateKv, "999");
    const msg = { chat: { id: 999 }, text: "/start" };
    await dispatch(msg, env as Parameters<typeof dispatch>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("欢迎");
  });

  it("/start from non-owner is silently ignored", async () => {
    const msg = { chat: { id: 888 }, text: "/start" };
    await dispatch(msg, env as Parameters<typeof dispatch>[1]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("/block from owner invokes block handler and writes blacklist", async () => {
    await setOwnerChatId(stateKv, "999");
    const msg = { chat: { id: 999 }, text: "/block 123" };
    await dispatch(msg, env as Parameters<typeof dispatch>[1]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    const body = JSON.parse((calls[0] as any)[1].body);
    expect(body.text).toContain("已加入黑名单");

    const list = await getBlacklist(stateKv);
    expect(list).toContain("123");
  });

  it("/block from non-owner is silently ignored", async () => {
    const msg = { chat: { id: 888 }, text: "/block 123" };
    await dispatch(msg, env as Parameters<typeof dispatch>[1]);
    expect(mockFetch).not.toHaveBeenCalled();
    const list = await getBlacklist(stateKv);
    expect(list).not.toContain("123");
  });

  it("/whitelist from owner adds to whitelist", async () => {
    await setOwnerChatId(stateKv, "999");
    const msg = { chat: { id: 999 }, text: "/whitelist 456" };
    await dispatch(msg, env as Parameters<typeof dispatch>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const list = await getWhitelist(stateKv);
    expect(list).toContain("456");
  });
});
