import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleRules } from "../../commands/rules";
import { setOwnerChatId, setRules, getRules } from "../../kv/store";

describe("handleRules", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;
  const rulesKv = env.RULES as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
    await rulesKv.delete("bot:rules");
    await setOwnerChatId(stateKv, "999");
    mockFetch = vi.spyOn(globalThis, "fetch") as unknown as ReturnType<typeof vi.spyOn>;
    // Fresh Response per call — a shared instance fails on the 2nd read
    // ("Body has already been used") in tests that issue multiple calls.
    mockFetch.mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  function lastText(): string {
    const calls = mockFetch.mock.calls as unknown as [unknown, { body: string }][];
    return JSON.parse((calls[calls.length - 1] as any)[1].body).text as string;
  }

  it("non-owner is ignored (no reply)", async () => {
    await handleRules(
      { chat: { id: 888 }, text: "/rules list" },
      env as Parameters<typeof handleRules>[1]
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("list with no override shows the code defaults", async () => {
    await handleRules(
      { chat: { id: 999 }, text: "/rules list" },
      env as Parameters<typeof handleRules>[1]
    );
    expect(lastText()).toContain("代码默认");
  });

  it("add appends a keyword and persists it to RULES", async () => {
    await handleRules(
      { chat: { id: 999 }, text: "/rules add 自定义词" },
      env as Parameters<typeof handleRules>[1]
    );
    const payload = await getRules(rulesKv);
    expect(payload?.keywords).toContain("自定义词");
    expect(lastText()).toContain("已添加");
  });

  it("add is idempotent for an existing keyword", async () => {
    const e = env as Parameters<typeof handleRules>[1];
    await handleRules({ chat: { id: 999 }, text: "/rules add 词" }, e);
    await handleRules({ chat: { id: 999 }, text: "/rules add 词" }, e);
    const payload = await getRules(rulesKv);
    expect(payload?.keywords?.filter((k) => k === "词")).toHaveLength(1);
    expect(lastText()).toContain("已存在");
  });

  it("add with an empty argument replies usage", async () => {
    await handleRules(
      { chat: { id: 999 }, text: "/rules add" },
      env as Parameters<typeof handleRules>[1]
    );
    expect(lastText()).toContain("用法");
  });

  it("del removes a keyword", async () => {
    const e = env as Parameters<typeof handleRules>[1];
    await handleRules({ chat: { id: 999 }, text: "/rules add 词" }, e);
    await handleRules({ chat: { id: 999 }, text: "/rules del 词" }, e);
    const payload = await getRules(rulesKv);
    expect(payload?.keywords).not.toContain("词");
  });

  it("del of a missing keyword reports not found", async () => {
    await handleRules(
      { chat: { id: 999 }, text: "/rules del 不存在" },
      env as Parameters<typeof handleRules>[1]
    );
    expect(lastText()).toContain("未找到");
  });

  it("del of the last keyword reports the list is now empty", async () => {
    await setRules(rulesKv, { keywords: ["only"] });
    await handleRules(
      { chat: { id: 999 }, text: "/rules del only" },
      env as Parameters<typeof handleRules>[1]
    );
    expect(lastText()).toContain("已清空");
  });

  it("reset deletes the override", async () => {
    await setRules(rulesKv, { keywords: ["x"] });
    await handleRules(
      { chat: { id: 999 }, text: "/rules reset" },
      env as Parameters<typeof handleRules>[1]
    );
    expect(await getRules(rulesKv)).toBeNull();
    expect(lastText()).toContain("已恢复默认");
  });

  it("HTML metacharacters in a keyword are escaped in the reply", async () => {
    await handleRules(
      { chat: { id: 999 }, text: "/rules add <b>x" },
      env as Parameters<typeof handleRules>[1]
    );
    expect(lastText()).toContain("&lt;b&gt;");
  });

  it("unknown subcommand replies usage", async () => {
    await handleRules(
      { chat: { id: 999 }, text: "/rules frobnicate" },
      env as Parameters<typeof handleRules>[1]
    );
    expect(lastText()).toContain("用法");
  });
});
