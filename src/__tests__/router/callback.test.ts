/**
 * callback handler tests — U5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../config";

// ---------------------------------------------------------------------------
// Mock implementations — hoisted so vi.mock can reference them at top-level
// ---------------------------------------------------------------------------

const {
  mockAddToWhitelist,
  mockDeletePendingMessageId,
  mockGetOwnerChatId,
  mockAnswerCallbackQuery,
  mockCopyMessageToOwner,
} = vi.hoisted(() => ({
  mockAddToWhitelist: vi.fn<[KVNamespace, string], Promise<void>>(),
  mockDeletePendingMessageId: vi.fn<[KVNamespace, string], Promise<void>>(),
  mockGetOwnerChatId: vi.fn<[KVNamespace], Promise<string | null>>(),
  mockAnswerCallbackQuery: vi.fn<[string, string | undefined, Env], Promise<void>>(),
  mockCopyMessageToOwner: vi.fn<
    [number | string, number | string, number, string, Env, boolean],
    Promise<void>
  >(),
}));

vi.mock("../../kv/store", () => ({
  addToWhitelist: mockAddToWhitelist,
  deletePendingMessageId: mockDeletePendingMessageId,
  getOwnerChatId: mockGetOwnerChatId,
}));

vi.mock("../../telegram/send", () => ({
  answerCallbackQuery: mockAnswerCallbackQuery,
  copyMessageToOwner: mockCopyMessageToOwner,
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { handleCallbackQuery, getCalls, __reset } from "../../router/callback";

// ---------------------------------------------------------------------------
// KV stub — minimal KVNamespace that implements .get()
// ---------------------------------------------------------------------------

function createKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) { return store.get(key) ?? null; },
    async put(key: string, value: string | null) {
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

beforeEach(() => {
  mockAddToWhitelist.mockReset().mockResolvedValue(undefined);
  mockDeletePendingMessageId.mockReset().mockResolvedValue(undefined);
  mockGetOwnerChatId.mockReset().mockResolvedValue(null);
  mockAnswerCallbackQuery.mockReset().mockResolvedValue(undefined);
  mockCopyMessageToOwner.mockReset().mockResolvedValue(undefined);
  __reset(); // always start with a clean counter
});

describe("handleCallbackQuery", () => {
  describe('data: "verify:123" with from.id === 123', () => {
    it("calls addToWhitelist", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 123 }, data: "verify:123" },
        stubEnv()
      );
      expect(mockAddToWhitelist).toHaveBeenCalledTimes(1);
      expect(mockAddToWhitelist).toHaveBeenCalledWith(expect.anything(), "123");
    });

    it("calls deletePendingMessageId", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 123 }, data: "verify:123" },
        stubEnv()
      );
      expect(mockDeletePendingMessageId).toHaveBeenCalledTimes(1);
      expect(mockDeletePendingMessageId).toHaveBeenCalledWith(expect.anything(), "123");
    });

    it("calls answerCallbackQuery with confirmation toast", async () => {
      await handleCallbackQuery(
        { id: "q_abc", from: { id: 456 }, data: "verify:456" },
        stubEnv()
      );
      expect(mockAnswerCallbackQuery).toHaveBeenCalledTimes(1);
      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("q_abc", "已加入白名单", expect.anything());
    });

    it("sends notification to owner via copyMessageToOwner", async () => {
      const kv = createKV();
      // Seed owner_chat_id directly into the KV (callback reads env.STATE.get directly)
      await kv.put("bot:owner_chat_id", "111");
      await handleCallbackQuery(
        { id: "q1", from: { id: 789, username: "stranger_john" }, data: "verify:789" },
        stubEnv(kv)
      );
      expect(mockCopyMessageToOwner).toHaveBeenCalledTimes(1);
      // copyMessageToOwner(owner_chat_id, source_chat_id, message_id, prefix, env, isText)
      const [ownerId, sourceId, , prefix, , isText] = mockCopyMessageToOwner.mock.calls[0]!;
      expect(ownerId).toBe("111");
      expect(sourceId).toBe("789");
      expect(prefix).toContain("stranger_john");
      expect(prefix).toContain("789");
      expect(isText).toBe(true);
    });
  });

  describe('data: "verify:123" with from.id === 999 (forged)', () => {
    it("does NOT call addToWhitelist", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 999 }, data: "verify:123" },
        stubEnv()
      );
      expect(mockAddToWhitelist).not.toHaveBeenCalled();
    });

    it("does NOT call deletePendingMessageId", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 999 }, data: "verify:123" },
        stubEnv()
      );
      expect(mockDeletePendingMessageId).not.toHaveBeenCalled();
    });

    it("calls answerCallbackQuery to dismiss spinner (no text)", async () => {
      await handleCallbackQuery(
        { id: "q_forged", from: { id: 999 }, data: "verify:123" },
        stubEnv()
      );
      expect(mockAnswerCallbackQuery).toHaveBeenCalledTimes(1);
      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("q_forged", undefined, expect.anything());
    });

    it("logs a console.warn about the forged callback", async () => {
      const warnSpy = vi.spyOn(console, "warn");
      await handleCallbackQuery(
        { id: "q1", from: { id: 999 }, data: "verify:123" },
        stubEnv()
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("forged callback rejected")
      );
    });
  });

  describe('data: "block:999" (other callback format)', () => {
    it("does NOT call addToWhitelist", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 999 }, data: "block:999" },
        stubEnv()
      );
      expect(mockAddToWhitelist).not.toHaveBeenCalled();
    });

    it("does NOT call deletePendingMessageId", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 999 }, data: "block:999" },
        stubEnv()
      );
      expect(mockDeletePendingMessageId).not.toHaveBeenCalled();
    });

    it("does NOT call answerCallbackQuery or copyMessageToOwner", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 999 }, data: "block:999" },
        stubEnv()
      );
      expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
      expect(mockCopyMessageToOwner).not.toHaveBeenCalled();
    });
  });

  describe("callback with no data", () => {
    it("is silent — no KV writes, no send calls", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 123 } },
        stubEnv()
      );
      expect(mockAddToWhitelist).not.toHaveBeenCalled();
      expect(mockDeletePendingMessageId).not.toHaveBeenCalled();
      expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
      expect(mockCopyMessageToOwner).not.toHaveBeenCalled();
    });
  });
});

describe("getCalls and __reset backward compat with U2", () => {
  it("getCalls returns call count within a test", async () => {
    await handleCallbackQuery({ id: "q1", from: { id: 1 }, data: "verify:1" }, stubEnv());
    await handleCallbackQuery({ id: "q2", from: { id: 2 }, data: "verify:2" }, stubEnv());
    expect(getCalls()).toBe(2);
  });

  it("__reset clears the counter", async () => {
    await handleCallbackQuery({ id: "q1", from: { id: 1 }, data: "verify:1" }, stubEnv());
    __reset();
    expect(getCalls()).toBe(0);
  });
});
