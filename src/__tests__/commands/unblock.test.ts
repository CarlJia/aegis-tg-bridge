import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleUnblock } from "../../commands/unblock";
import { setOwnerChatId, addToBlacklist, getBlacklist } from "../../kv/store";
import { registerRelayTarget } from "../../telegram/forward";

describe("handleUnblock", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  function firstSentBody(): { text?: string } {
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    return JSON.parse((calls[0] as any)[1].body);
  }

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
    await stateKv.delete("bot:blacklist");
    await stateKv.delete("bot:message_map:42");
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

  it("removes an explicit chat_id from the blacklist", async () => {
    await addToBlacklist(stateKv, "111");

    const msg = { chat: { id: 999 }, text: "/unblock 111" };
    await handleUnblock(msg, env as Parameters<typeof handleUnblock>[1]);

    expect(await getBlacklist(stateKv)).not.toContain("111");
    expect(firstSentBody().text).toContain("已移出黑名单");
  });

  it("reply '/unblock' without argument removes the replied conversation", async () => {
    await addToBlacklist(stateKv, "333");
    await registerRelayTarget(stateKv, 42, "333", "999");

    const msg = {
      chat: { id: 999 },
      text: "/unblock",
      reply_to_message: { message_id: 42 },
    };
    await handleUnblock(msg, env as Parameters<typeof handleUnblock>[1]);

    expect(await getBlacklist(stateKv)).not.toContain("333");
    expect(firstSentBody().text).toContain("333");
  });

  it("an unknown chat_id still reports success without touching the list", async () => {
    await addToBlacklist(stateKv, "111");

    const msg = { chat: { id: 999 }, text: "/unblock 222" };
    await handleUnblock(msg, env as Parameters<typeof handleUnblock>[1]);

    expect(await getBlacklist(stateKv)).toEqual(["111"]);
    expect(firstSentBody().text).toContain("已移出黑名单: 222");
  });

  it("replies the usage hint when neither argument nor reply is present", async () => {
    const msg = { chat: { id: 999 }, text: "/unblock" };
    await handleUnblock(msg, env as Parameters<typeof handleUnblock>[1]);

    expect(firstSentBody().text).toContain("用法");
  });

  it("ignores a non-owner sender entirely", async () => {
    await addToBlacklist(stateKv, "111");

    const msg = { chat: { id: 888 }, text: "/unblock 111" };
    await handleUnblock(msg, env as Parameters<typeof handleUnblock>[1]);

    expect(await getBlacklist(stateKv)).toContain("111");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
