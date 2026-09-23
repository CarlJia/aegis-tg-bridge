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
  mockGetPendingMessageId,
  mockGetOwnerChatId,
  mockSetMessageMap,
  mockAnswerCallbackQuery,
  mockCopyMessageToOwner,
  mockDeleteMessage,
} = vi.hoisted(() => ({
  mockAddToWhitelist: vi.fn<[KVNamespace, string], Promise<void>>(),
  mockDeletePendingMessageId: vi.fn<[KVNamespace, string], Promise<void>>(),
  mockGetPendingMessageId: vi.fn<[KVNamespace, string], Promise<string | null>>(),
  mockGetOwnerChatId: vi.fn<[KVNamespace], Promise<string | null>>(),
  mockSetMessageMap: vi.fn<[KVNamespace, string, string, number?], Promise<void>>(),
  mockAnswerCallbackQuery: vi.fn<[string, string | undefined, Env], Promise<void>>(),
  mockCopyMessageToOwner: vi.fn<
    [number | string, number | string, number, string, Env, boolean],
    Promise<number | null>
  >(),
  mockDeleteMessage: vi.fn<[number | string, number, Env], Promise<void>>(),
}));

vi.mock("../../kv/store", () => ({
  addToWhitelist: mockAddToWhitelist,
  deletePendingMessageId: mockDeletePendingMessageId,
  getPendingMessageId: mockGetPendingMessageId,
  getOwnerChatId: mockGetOwnerChatId,
  setMessageMap: mockSetMessageMap,
}));

vi.mock("../../telegram/send", () => ({
  answerCallbackQuery: mockAnswerCallbackQuery,
  copyMessageToOwner: mockCopyMessageToOwner,
  deleteMessage: mockDeleteMessage,
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
  mockGetPendingMessageId.mockReset().mockResolvedValue(null);
  mockGetOwnerChatId.mockReset().mockResolvedValue(null);
  mockSetMessageMap.mockReset().mockResolvedValue(undefined);
  mockAnswerCallbackQuery.mockReset().mockResolvedValue(undefined);
  mockCopyMessageToOwner.mockReset().mockResolvedValue(null);
  mockDeleteMessage.mockReset().mockResolvedValue(undefined);
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

    it("forwards the stranger's original message to the owner", async () => {
      mockGetOwnerChatId.mockResolvedValueOnce("111");
      mockGetPendingMessageId.mockResolvedValueOnce(
        JSON.stringify({ message_id: 5, text: "想谈合作", caption: null })
      );
      await handleCallbackQuery(
        { id: "q1", from: { id: 789, username: "stranger_john" }, data: "verify:789" },
        stubEnv()
      );
      expect(mockCopyMessageToOwner).toHaveBeenCalledTimes(1);
      // copyMessageToOwner(owner_chat_id, source_chat_id, message_id, prefix, env, isText)
      const [ownerId, sourceId, , body, , isText] = mockCopyMessageToOwner.mock.calls[0]!;
      expect(ownerId).toBe("111");
      expect(sourceId).toBe("789");
      expect(body).toContain("[from @stranger_john · chat_id=789]");
      expect(body).toContain("想谈合作");
      expect(isText).toBe(true);
    });

    it("registers the forwarded verify-time message so the owner can reply to it", async () => {
      mockGetOwnerChatId.mockResolvedValueOnce("111");
      mockGetPendingMessageId.mockResolvedValueOnce(
        JSON.stringify({ message_id: 5, text: "想谈合作", caption: null })
      );
      mockCopyMessageToOwner.mockResolvedValueOnce(777);

      await handleCallbackQuery(
        { id: "q1", from: { id: 789, username: "stranger_john" }, data: "verify:789" },
        stubEnv()
      );

      expect(mockSetMessageMap).toHaveBeenCalledTimes(1);
      const [, key, val] = mockSetMessageMap.mock.calls[0]!;
      expect(key).toBe("777");
      expect(JSON.parse(val).stranger_chat_id).toBe("789");
    });

    it("does not register a mapping when the forward failed", async () => {
      mockGetOwnerChatId.mockResolvedValueOnce("111");
      mockCopyMessageToOwner.mockResolvedValueOnce(null);

      await handleCallbackQuery(
        { id: "q1", from: { id: 789 }, data: "verify:789" },
        stubEnv()
      );

      expect(mockSetMessageMap).not.toHaveBeenCalled();
    });

    it("deletes the verify button message after a successful verify", async () => {
      await handleCallbackQuery(
        { id: "q1", from: { id: 123 }, data: "verify:123", message: { message_id: 55 } },
        stubEnv()
      );

      expect(mockDeleteMessage).toHaveBeenCalledTimes(1);
      expect(mockDeleteMessage).toHaveBeenCalledWith("123", 55, expect.anything());
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
