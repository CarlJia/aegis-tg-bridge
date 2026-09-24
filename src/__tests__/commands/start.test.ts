import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { handleStart } from "../../commands/start";
import { getOwnerChatId } from "../../kv/store";

describe("handleStart", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  // @ts-ignore
  let mockFetch: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
    mockFetch = vi.spyOn(globalThis, "fetch") as unknown as ReturnType<typeof vi.spyOn>;
    // Fresh Response per call — handleStart now issues two calls.
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

  function calls(): [string, { body: string }][] {
    return mockFetch.mock.calls as unknown as [string, { body: string }][];
  }

  it("writes owner_chat_id on first /start", async () => {
    const msg = { chat: { id: 999 } };
    await handleStart(msg, env as Parameters<typeof handleStart>[1]);
    const ownerId = await getOwnerChatId(stateKv);
    expect(ownerId).toBe("999");
  });

  it("reply message includes welcome strings", async () => {
    const msg = { chat: { id: 999 } };
    await handleStart(msg, env as Parameters<typeof handleStart>[1]);
    const sent = calls()
      .map((c) => JSON.parse(c[1].body))
      .find((b) => typeof b.text === "string");
    expect(sent?.text).toContain("欢迎");
    expect(sent?.text).toContain("命令清单");
    expect(sent?.text).toContain("/block");
  });

  it("registers the command menu scoped to the owner chat only", async () => {
    const msg = { chat: { id: 999 } };
    await handleStart(msg, env as Parameters<typeof handleStart>[1]);
    const setCmds = calls().find((c) => String(c[0]).endsWith("setMyCommands"));
    expect(setCmds).toBeDefined();
    const body = JSON.parse(setCmds![1].body);
    expect(body.scope).toEqual({ type: "chat", chat_id: 999 });
    expect(
      body.commands.map((c: { command: string }) => c.command)
    ).toContain("rules");
  });

  it("issues exactly two calls: setMyCommands then sendMessage", async () => {
    const msg = { chat: { id: 999 } };
    await handleStart(msg, env as Parameters<typeof handleStart>[1]);
    const endpoints = calls().map((c) => String(c[0]).split("/").pop());
    expect(endpoints).toEqual(["setMyCommands", "sendMessage"]);
  });
});
