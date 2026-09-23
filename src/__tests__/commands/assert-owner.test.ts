import { describe, it, expect, beforeEach } from "vitest";
// @ts-ignore
import { env, createExecutionContext } from "cloudflare:test";
import { assertOwner } from "../../commands/assert-owner";
import { setOwnerChatId } from "../../kv/store";

describe("assertOwner", () => {
  // @ts-ignore
  const ctx = createExecutionContext();
  const stateKv = env.STATE as KVNamespace;

  beforeEach(async () => {
    await stateKv.delete("bot:owner_chat_id");
  });

  it("returns true when owner_chat_id matches message.chat.id", async () => {
    await setOwnerChatId(stateKv, "999");
    const msg = { chat: { id: 999 } };
    const result = await assertOwner(msg, env as Parameters<typeof assertOwner>[1]);
    expect(result).toBe(true);
  });

  it("returns false when owner_chat_id does not match", async () => {
    await setOwnerChatId(stateKv, "999");
    const msg = { chat: { id: 888 } };
    const result = await assertOwner(msg, env as Parameters<typeof assertOwner>[1]);
    expect(result).toBe(false);
  });

  it("returns false when owner_chat_id is not set", async () => {
    const msg = { chat: { id: 999 } };
    const result = await assertOwner(msg, env as Parameters<typeof assertOwner>[1]);
    expect(result).toBe(false);
  });
});
