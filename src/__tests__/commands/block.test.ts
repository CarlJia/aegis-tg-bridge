import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleBlock } from "../../commands/block";
import { setOwnerChatId, addToBlacklist, getBlacklist, setMessageMap } from "../../kv/store";
import { registerRelayTarget } from "../../telegram/forward";

describe("handleBlock", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  /** 第一条出站请求的 body —— 命令回复 owner 的那条消息。 */
  function firstSentBody(): { text?: string } {
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    return JSON.parse((calls[0] as any)[1].body);
  }

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
    await stateKv.delete("bot:blacklist");
    await stateKv.delete("bot:message_map:42");
    await stateKv.delete("bot:message_map:43");
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
    expect(firstSentBody().text).toContain("用法");
  });

  it("valid chat_id calls addToBlacklist and replies confirmation", async () => {
    const msg = { chat: { id: 999 }, text: "/block 111" };
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);

    const list = await getBlacklist(stateKv);
    expect(list).toContain("111");

    expect(firstSentBody().text).toContain("已加入黑名单");
  });

  it("calls TG fetch exactly once on success", async () => {
    const msg = { chat: { id: 999 }, text: "/block 222" };
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("reply '/block' without argument blocks the replied stranger's chat_id", async () => {
    // owner replies to a forwarded stranger message (message_id 42 in owner's chat)
    await setMessageMap(
      stateKv,
      "42",
      JSON.stringify({
        stranger_chat_id: "333",
        owner_chat_id: "999",
        expires_at: 0,
      })
    );

    const msg = {
      chat: { id: 999 },
      text: "/block",
      reply_to_message: { message_id: 42 },
    };
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);

    const list = await getBlacklist(stateKv);
    expect(list).toContain("333");

    const body = firstSentBody();
    expect(body.text).toContain("已加入黑名单");
    expect(body.text).toContain("333");
  });

  it("an explicit chat_id argument wins over the reply context", async () => {
    await registerRelayTarget(stateKv, 43, "333", "999");

    const msg = {
      chat: { id: 999 },
      text: "/block 444",
      reply_to_message: { message_id: 43 },
    };
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);

    const list = await getBlacklist(stateKv);
    expect(list).toContain("444");
    expect(list).not.toContain("333");
  });

  it("an invalid explicit chat_id does not fall back to the reply context", async () => {
    await registerRelayTarget(stateKv, 43, "333", "999");

    const msg = {
      chat: { id: 999 },
      text: "/block abc",
      reply_to_message: { message_id: 43 },
    };
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);

    expect(await getBlacklist(stateKv)).toEqual([]);
    expect(firstSentBody().text).toContain("用法");
  });

  it.each([
    {
      case: "neither an argument nor a reply",
      msg: { chat: { id: 999 }, text: "/block" },
      expected: "用法",
    },
    {
      case: "a reply without a known mapping",
      msg: {
        chat: { id: 999 },
        text: "/block",
        reply_to_message: { message_id: 404 },
      },
      expected: "无法从被回复的消息解析 chat_id",
    },
  ])("$case replies a hint and blocks nobody", async ({ msg, expected }) => {
    await handleBlock(msg, env as Parameters<typeof handleBlock>[1]);

    expect(await getBlacklist(stateKv)).toEqual([]);
    expect(firstSentBody().text).toContain(expected);
  });
});
