import { describe, it, expect, beforeEach } from "vitest";
// @ts-ignore - cloudflare:test is provided by @cloudflare/vitest-pool-workers
import { env, createExecutionContext } from "cloudflare:test";
import {
  addToWhitelist,
  getWhitelist,
  removeFromWhitelist,
  setMessageMap,
  getMessageMap,
  lookupMessageMap,
  pushSummary,
  getSummary,
  setOwnerChatId,
  getOwnerChatId,
  setUserSettings,
  getUserSettings,
  setPendingMessageId,
  getPendingMessageId,
  deletePendingMessageId,
  getRules,
  setRules,
  deleteRules,
} from "../../kv/store";

describe("KV store", () => {
  const ctx = createExecutionContext();
  const kv = env.STATE as KVNamespace;
  const rulesKv = env.RULES as KVNamespace;

  beforeEach(async () => {
    // Reset keys before each test
    await kv.delete("bot:whitelist");
    await kv.delete("bot:owner_chat_id");
    await kv.delete("bot:pending_buttons:x");
    await kv.delete("bot:pending_buttons:m1");
    await kv.delete("bot:summary_queue:2026-09-23");
    await kv.delete("bot:message_map:m1");
    await kv.delete("bot:user_settings:999");
    await rulesKv.delete("bot:rules");
  });

  // -------------------------------------------------------------------------
  // Whitelist
  // -------------------------------------------------------------------------

  it("addToWhitelist then getWhitelist contains the id", async () => {
    await addToWhitelist(kv, "123");
    const list = await getWhitelist(kv);
    expect(list).toContain("123");
  });

  it("removeFromWhitelist removes the id", async () => {
    await addToWhitelist(kv, "123");
    await removeFromWhitelist(kv, "123");
    const list = await getWhitelist(kv);
    expect(list).not.toContain("123");
  });

  // -------------------------------------------------------------------------
  // Message Map
  // -------------------------------------------------------------------------

  it("setMessageMap then getMessageMap returns the value", async () => {
    await setMessageMap(kv, "m1", "chat:123");
    const value = await getMessageMap(kv, "m1");
    expect(value).toBe("chat:123");
  });

  it("setMessageMap accepts explicit expirationTtl >= 1 without crash", async () => {
    // Should not throw
    await setMessageMap(kv, "m1", "chat:456", 60 * 60 * 24 * 30);
    const value = await getMessageMap(kv, "m1");
    expect(value).toBe("chat:456");
  });

  // -------------------------------------------------------------------------
  // Summary Queue
  // -------------------------------------------------------------------------

  it("pushSummary then getSummary contains the entry", async () => {
    const entry = {
      ts: 1,
      chat_id: "x",
      snippet: "hi",
      rule_hit: "k",
      has_media: false,
    };
    await pushSummary(kv, "2026-09-23", entry);
    const summary = await getSummary(kv, "2026-09-23");
    expect(summary).toContainEqual(entry);
  });

  // -------------------------------------------------------------------------
  // Owner Chat ID
  // -------------------------------------------------------------------------

  it("setOwnerChatId then getOwnerChatId returns the id", async () => {
    await setOwnerChatId(kv, "999");
    const id = await getOwnerChatId(kv);
    expect(id).toBe("999");
  });

  // -------------------------------------------------------------------------
  // User Settings
  // -------------------------------------------------------------------------

  it("setUserSettings then getUserSettings round-trips", async () => {
    const settings = { timezone: "Asia/Shanghai", summaryTimeHour: 22 };
    await setUserSettings(kv, "999", settings);
    const retrieved = await getUserSettings(kv, "999");
    expect(retrieved).toEqual(settings);
  });

  // -------------------------------------------------------------------------
  // Pending Message ID
  // -------------------------------------------------------------------------

  it("setPendingMessageId then getPendingMessageId returns the id", async () => {
    await setPendingMessageId(kv, "x", "m1");
    const mid = await getPendingMessageId(kv, "x");
    expect(mid).toBe("m1");
  });

  it("deletePendingMessageId then getPendingMessageId returns null", async () => {
    await setPendingMessageId(kv, "x", "m1");
    await deletePendingMessageId(kv, "x");
    const mid = await getPendingMessageId(kv, "x");
    expect(mid).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  it("getRules returns null when unset", async () => {
    expect(await getRules(rulesKv)).toBeNull();
  });

  it("setRules then getRules round-trips", async () => {
    await setRules(rulesKv, { keywords: ["foo"] });
    const rules = await getRules(rulesKv);
    expect(rules).toEqual({ keywords: ["foo"] });
  });

  it("deleteRules then getRules returns null", async () => {
    await setRules(rulesKv, { keywords: ["foo"] });
    await deleteRules(rulesKv);
    expect(await getRules(rulesKv)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Message map lookup
  // -------------------------------------------------------------------------

  it("lookupMessageMap reports 'missing' for an unset key", async () => {
    expect(await lookupMessageMap(kv, "nope")).toEqual({ status: "missing" });
  });

  it("lookupMessageMap returns the entry for a valid record", async () => {
    const entry = { stranger_chat_id: "123", owner_chat_id: "999", expires_at: 1 };
    await setMessageMap(kv, "m1", JSON.stringify(entry));
    expect(await lookupMessageMap(kv, "m1")).toEqual({ status: "ok", entry });
  });

  it("lookupMessageMap reports 'corrupt' for unparseable JSON", async () => {
    await setMessageMap(kv, "m1", "not-json");
    expect(await lookupMessageMap(kv, "m1")).toEqual({ status: "corrupt" });
  });

  it("lookupMessageMap reports 'corrupt' when stranger_chat_id is absent", async () => {
    await setMessageMap(kv, "m1", JSON.stringify({ owner_chat_id: "999" }));
    expect(await lookupMessageMap(kv, "m1")).toEqual({ status: "corrupt" });
  });
});
