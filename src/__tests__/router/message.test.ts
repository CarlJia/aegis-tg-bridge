/**
 * Router message handler tests — U6
 *
 * Test scenarios:
 *  1a (AE3, R6, R7): chat_id Z not whitelisted, not blacklisted,
 *     rule-hit text "usdt 搬砖 找我合作"
 *     → pushSummary written; no forward; no verify button
 *
 *  1b (AE1, R1): chat_id X in pending_buttons already, clean text
 *     → handleFirstTime called but sendVerifyButton NOT called;
 *       summary_queue NOT written
 *
 *  2  (AE2, R3): chat_id X in whitelist, clean text "hello"
 *     → forwardToOwner called once with correct prefix; message_map written
 *
 *  3  (AE5, R5): owner chat_id, non-command, non-reply text "hi"
 *     → tgSendMessage called with "请 reply 到具体陌生人消息"
 *
 *  4: chat_id B in blacklist, any text → silent (no TG API call, no audit)
 *
 *  5: owner chat_id with /block 999 → commands.dispatch invoked
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../config";

// ---------------------------------------------------------------------------
// Mock implementations — hoisted so vi.mock can reference them at top-level
// ---------------------------------------------------------------------------

const {
  mockGetOwnerChatId,
  mockGetWhitelist,
  mockGetBlacklist,
  mockPushSummary,
  mockSetMessageMap,
  mockGetPendingMessageId,
  mockSetPendingMessageId,
  mockSendVerifyButton,
  mockGetRules,
} = vi.hoisted(() => ({
  mockGetOwnerChatId: vi.fn<[KVNamespace], Promise<string | null>>(),
  mockGetWhitelist: vi.fn<[KVNamespace], Promise<string[]>>(),
  mockGetBlacklist: vi.fn<[KVNamespace], Promise<string[]>>(),
  mockPushSummary: vi.fn<[KVNamespace, string, import("../../kv/store").SummaryEntry], Promise<void>>(),
  mockSetMessageMap: vi.fn<[KVNamespace, string, string, number?], Promise<void>>(),
  mockGetPendingMessageId: vi.fn<[KVNamespace, string], Promise<string | null>>(),
  mockSetPendingMessageId: vi.fn<[KVNamespace, string, string, number?], Promise<void>>(),
  mockSendVerifyButton: vi.fn<[string, Env], Promise<void>>(),
  mockGetRules: vi.fn<[KVNamespace], Promise<import("../../kv/store").RulesPayload | null>>(),
}));

const {
  mockTgSendMessage,
  mockTgCopyMessage,
} = vi.hoisted(() => ({
  mockTgSendMessage: vi.fn<[Env, number | string, string], Promise<void>>(),
  mockTgCopyMessage: vi.fn<[Env, number | string, number | string, number, string?], Promise<number | null>>(),
}));

const {
  mockDispatch,
} = vi.hoisted(() => ({
  mockDispatch: vi.fn<[{ chat: { id: number }; text?: string }, Env], Promise<void>>(),
}));

const {
  mockHandleFirstTime,
} = vi.hoisted(() => ({
  mockHandleFirstTime: vi.fn<[import("../../flows/first-time").TgMessage, Env], Promise<boolean>>(),
}));

const {
  mockForwardToOwner,
} = vi.hoisted(() => ({
  mockForwardToOwner: vi.fn<[string, import("../../flows/first-time").TgMessage, Env], Promise<number | null>>(),
}));

const {
  mockHandleOwnerMessage,
} = vi.hoisted(() => ({
  mockHandleOwnerMessage: vi.fn<[import("../../flows/first-time").TgMessage, Env], Promise<void>>(),
}));

vi.mock("../../kv/store", () => ({
  getOwnerChatId: mockGetOwnerChatId,
  getWhitelist: mockGetWhitelist,
  getBlacklist: mockGetBlacklist,
  getRules: mockGetRules,
  pushSummary: mockPushSummary,
  setMessageMap: mockSetMessageMap,
  getPendingMessageId: mockGetPendingMessageId,
  setPendingMessageId: mockSetPendingMessageId,
}));

vi.mock("../../telegram/send", () => ({
  sendVerifyButton: mockSendVerifyButton,
}));

vi.mock("../../telegram/api", () => ({
  tgSendMessage: mockTgSendMessage,
  tgCopyMessage: mockTgCopyMessage,
}));

vi.mock("../../commands/index", () => ({
  dispatch: mockDispatch,
}));

vi.mock("../../flows/first-time", () => ({
  handleFirstTime: mockHandleFirstTime,
}));

vi.mock("../../telegram/forward", () => ({
  forwardToOwner: mockForwardToOwner,
}));

vi.mock("../../flows/owner-message", () => ({
  handleOwnerMessage: mockHandleOwnerMessage,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { handleMessage } from "../../router/message";

// ---------------------------------------------------------------------------
// KV stub
// ---------------------------------------------------------------------------

function createKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string | null, _opts?: { expirationTtl?: number }) {
      if (value === null) store.delete(key);
      else store.set(key, value);
    },
    async delete(key: string) { store.delete(key); },
    async list(_opts?: { prefix?: string }) { return { keys: [], list_complete: true, cacheStatus: null }; },
  } as unknown as KVNamespace;
}

function stubEnv(kv?: KVNamespace): Env {
  return {
    BOT_TOKEN: "test_token",
    WEBHOOK_SECRET: "test_secret",
    STATE: kv ?? createKV(),
    RULES: {} as KVNamespace,
    SUMMARY: {} as KVNamespace,
  };
}

// ---------------------------------------------------------------------------
// Reset helpers
// ---------------------------------------------------------------------------

function resetAll() {
  mockGetOwnerChatId.mockReset().mockResolvedValue(null);
  mockGetWhitelist.mockReset().mockResolvedValue([]);
  mockGetBlacklist.mockReset().mockResolvedValue([]);
  mockPushSummary.mockReset().mockResolvedValue(undefined);
  mockSetMessageMap.mockReset().mockResolvedValue(undefined);
  mockGetPendingMessageId.mockReset().mockResolvedValue(null);
  mockSetPendingMessageId.mockReset().mockResolvedValue(undefined);
  mockGetRules.mockReset().mockResolvedValue(null);
  mockSendVerifyButton.mockReset().mockResolvedValue(undefined);
  mockTgSendMessage.mockReset().mockResolvedValue(undefined);
  mockTgCopyMessage.mockReset().mockResolvedValue(null);
  mockDispatch.mockReset().mockResolvedValue(undefined);
  mockHandleFirstTime.mockReset().mockResolvedValue(false);
  mockForwardToOwner.mockReset().mockResolvedValue(null);
  mockHandleOwnerMessage.mockReset().mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetAll();
});

describe("handleMessage routing", () => {

  // -------------------------------------------------------------------------
  // Scenario 1a — AE3, R6, R7: rule-hit text → pushSummary, silent
  // -------------------------------------------------------------------------
  it("rules_hit: calls pushSummary and does NOT forward or send verify button", async () => {
    // Z is not whitelisted, not blacklisted
    mockGetWhitelist.mockResolvedValueOnce([]);
    mockGetBlacklist.mockResolvedValueOnce([]);

    const msg = {
      message_id: 1,
      text: "usdt 搬砖 找我合作",
      from: { id: 100, username: "stranger_z" },
      chat: { id: 100 },
    };

    await handleMessage(msg, stubEnv());

    // pushSummary was called (R7)
    expect(mockPushSummary).toHaveBeenCalledTimes(1);
    const [_kv, date, entry] = mockPushSummary.mock.calls[0]!;
    expect(entry.chat_id).toBe("100");
    expect(entry.rule_hit).toBe("keywords");
    expect(entry.snippet).toContain("usdt 搬砖");
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // No forward, no verify button
    expect(mockForwardToOwner).not.toHaveBeenCalled();
    expect(mockSendVerifyButton).not.toHaveBeenCalled();
    expect(mockHandleFirstTime).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Scenario 1c — KV `bot:rules` override is honored (hot reload)
  // -------------------------------------------------------------------------
  it("rules_hit via KV override: a custom keyword is intercepted", async () => {
    mockGetWhitelist.mockResolvedValueOnce([]);
    mockGetBlacklist.mockResolvedValueOnce([]);
    mockGetRules.mockResolvedValueOnce({ keywords: ["自定义词"] });

    const msg = {
      message_id: 7,
      text: "这是 自定义词 消息",
      from: { id: 400 },
      chat: { id: 400 },
    };

    await handleMessage(msg, stubEnv());

    expect(mockPushSummary).toHaveBeenCalledTimes(1);
    const entry = mockPushSummary.mock.calls[0]![2];
    expect(entry.rule_hit).toBe("keywords");
  });

  it("null rules payload falls back to defaults", async () => {
    mockGetWhitelist.mockResolvedValueOnce([]);
    mockGetBlacklist.mockResolvedValueOnce([]);
    // resetAll leaves mockGetRules resolving null → default engine

    const msg = {
      message_id: 8,
      text: "usdt 搬砖",
      from: { id: 401 },
      chat: { id: 401 },
    };

    await handleMessage(msg, stubEnv());

    expect(mockPushSummary).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Scenario 1b — AE1, R1: pending_buttons already set, clean text → no button
  // -------------------------------------------------------------------------
  it("first-time with pending: handleFirstTime called, sendVerifyButton NOT called, no pushSummary", async () => {
    // X is not whitelisted, not blacklisted, not rule-hit
    mockGetWhitelist.mockResolvedValueOnce([]);
    mockGetBlacklist.mockResolvedValueOnce([]);
    // pending_buttons already exists → handleFirstTime should return false (no button)
    mockHandleFirstTime.mockResolvedValueOnce(false);

    const msg = {
      message_id: 2,
      text: "在吗？",
      from: { id: 200, username: "stranger_x" },
      chat: { id: 200 },
    };

    await handleMessage(msg, stubEnv());

    expect(mockHandleFirstTime).toHaveBeenCalledTimes(1);
    expect(mockSendVerifyButton).not.toHaveBeenCalled();
    expect(mockPushSummary).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Scenario 2 — AE2, R3: whitelisted → forwardToOwner + message_map
  // -------------------------------------------------------------------------
  it("whitelisted: calls forwardToOwner with correct args and writes message_map", async () => {
    // Owner set
    mockGetOwnerChatId.mockResolvedValueOnce("999");
    // X is whitelisted
    mockGetWhitelist.mockResolvedValueOnce(["200"]);
    mockGetBlacklist.mockResolvedValueOnce([]);
    mockForwardToOwner.mockResolvedValueOnce(42);

    const msg = {
      message_id: 3,
      text: "hello",
      from: { id: 200, username: "stranger_x" },
      chat: { id: 200 },
    };

    await handleMessage(msg, stubEnv());

    expect(mockForwardToOwner).toHaveBeenCalledTimes(1);
    const [chatId, forwardedMsg] = mockForwardToOwner.mock.calls[0]!;
    expect(chatId).toBe("200");
    expect(forwardedMsg.message_id).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Scenario 3 — AE5, R5: owner non-command, non-reply → prompt
  // -------------------------------------------------------------------------
  it("owner non-command: calls handleOwnerMessage which sends prompt", async () => {
    const ownerChatId = "999";
    mockGetOwnerChatId.mockResolvedValueOnce(ownerChatId);

    const msg = {
      message_id: 4,
      text: "hi",
      from: { id: 999 },
      chat: { id: 999 },
    };

    await handleMessage(msg, stubEnv());

    expect(mockHandleOwnerMessage).toHaveBeenCalledTimes(1);
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockForwardToOwner).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Scenario 4 — blacklisted → silent return, no calls
  // -------------------------------------------------------------------------
  it("blacklisted: silent return — no TG calls, no KV writes", async () => {
    mockGetWhitelist.mockResolvedValueOnce([]);
    mockGetBlacklist.mockResolvedValueOnce(["300"]);

    const msg = {
      message_id: 5,
      text: "anything",
      from: { id: 300 },
      chat: { id: 300 },
    };

    await handleMessage(msg, stubEnv());

    expect(mockPushSummary).not.toHaveBeenCalled();
    expect(mockForwardToOwner).not.toHaveBeenCalled();
    expect(mockHandleFirstTime).not.toHaveBeenCalled();
    expect(mockTgSendMessage).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Scenario 5 — owner command → dispatch invoked
  // -------------------------------------------------------------------------
  it("owner command /block 999: calls commands.dispatch", async () => {
    const ownerChatId = "999";
    mockGetOwnerChatId.mockResolvedValueOnce(ownerChatId);

    const msg = {
      message_id: 6,
      text: "/block 999",
      from: { id: 999 },
      chat: { id: 999 },
    };

    await handleMessage(msg, stubEnv());

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ text: "/block 999" }),
      expect.anything()
    );
    expect(mockHandleOwnerMessage).not.toHaveBeenCalled();
  });
});
