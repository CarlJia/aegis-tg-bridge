/**
 * first-time flow tests — U5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../config";

// ---------------------------------------------------------------------------
// Mock implementations — hoisted so vi.mock can reference them at top-level
// ---------------------------------------------------------------------------

const { mockGetPendingMessageId, mockSetPendingMessageId, mockSendVerifyButton } = vi.hoisted(() => ({
  mockGetPendingMessageId: vi.fn<[KVNamespace, string], Promise<string | null>>(),
  mockSetPendingMessageId: vi.fn<[KVNamespace, string, string, number?], Promise<void>>(),
  mockSendVerifyButton: vi.fn<[string, Env], Promise<void>>(),
}));

vi.mock("../../kv/store", () => ({
  getPendingMessageId: mockGetPendingMessageId,
  setPendingMessageId: mockSetPendingMessageId,
}));

vi.mock("../../telegram/send", () => ({
  sendVerifyButton: mockSendVerifyButton,
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

import { handleFirstTime } from "../../flows/first-time";

function stubEnv(): Env {
  return {
    BOT_TOKEN: "test_token",
    WEBHOOK_SECRET: "test_secret",
    STATE: {} as KVNamespace,
    RULES: {} as KVNamespace,
    SUMMARY: {} as KVNamespace,
  };
}

beforeEach(() => {
  mockGetPendingMessageId.mockReset().mockResolvedValue(null);
  mockSetPendingMessageId.mockReset().mockResolvedValue(undefined);
  mockSendVerifyButton.mockReset().mockResolvedValue(undefined);
});

describe("handleFirstTime", () => {
  it("calls sendVerifyButton once for first-time chat_id with clean text", async () => {
    const msg = { message_id: 1, text: "找你谈合作", chat: { id: 888 } };
    const result = await handleFirstTime(msg, stubEnv());
    expect(result).toBe(true);
    expect(mockSendVerifyButton).toHaveBeenCalledTimes(1);
    expect(mockSendVerifyButton).toHaveBeenCalledWith("888", expect.anything());
  });

  it("stores a snapshot of the incoming message as the pending entry", async () => {
    const msg = { message_id: 42, text: "你好", chat: { id: 999 } };
    await handleFirstTime(msg, stubEnv());
    expect(mockSetPendingMessageId).toHaveBeenCalledTimes(1);
    const [, chatId, stored] = mockSetPendingMessageId.mock.calls[0]!;
    expect(chatId).toBe("999");
    expect(JSON.parse(stored)).toEqual({ message_id: 42, text: "你好", caption: null });
  });

  it("does NOT call sendVerifyButton when evaluateMessage hits (rule match)", async () => {
    const msg = {
      message_id: 1,
      text: "usdt 搬砖日入过千 https://example.com/promo",
      chat: { id: 777 },
    };
    const result = await handleFirstTime(msg, stubEnv());
    expect(result).toBe(false);
    expect(mockSendVerifyButton).not.toHaveBeenCalled();
  });

  it("does NOT call sendVerifyButton again when pending_buttons already exists", async () => {
    mockGetPendingMessageId.mockResolvedValueOnce("10");
    const msg = { message_id: 11, text: "在吗？", chat: { id: 555 } };
    const result = await handleFirstTime(msg, stubEnv());
    expect(result).toBe(false);
    expect(mockSendVerifyButton).not.toHaveBeenCalled();
  });

  it("returns false for a second clean message from same chat (button already sent)", async () => {
    const msg1 = { message_id: 1, text: "第一次", chat: { id: 666 } };
    await handleFirstTime(msg1, stubEnv());

    // Simulate: pending key already set from first message
    mockGetPendingMessageId.mockResolvedValueOnce("1");
    const msg2 = { message_id: 2, text: "第二次", chat: { id: 666 } };
    const result = await handleFirstTime(msg2, stubEnv());

    expect(result).toBe(false);
    expect(mockSendVerifyButton).toHaveBeenCalledTimes(1);
  });
});
