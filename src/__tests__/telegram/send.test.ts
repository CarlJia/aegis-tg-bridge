/**
 * send.ts tests — U5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendVerifyButton,
  answerCallbackQuery,
  copyMessageToOwner,
} from "../../telegram/send";
import type { Env } from "../../config";

function stubEnv(): Env {
  return {
    BOT_TOKEN: "test_token",
    WEBHOOK_SECRET: "test_secret",
    STATE: {} as KVNamespace,
    RULES: {} as KVNamespace,
    SUMMARY: {} as KVNamespace,
  };
}

const mockFetch = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>();
const REAL_API = "https://api.telegram.org";

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, result: {} }),
  } as Response);
  // Route ALL fetch calls through our mock
  vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendVerifyButton", () => {
  it("POSTs to the correct Bot API URL with inline_keyboard", async () => {
    await sendVerifyButton(12345, stubEnv());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${REAL_API}/bottest_token/sendMessage`);
    const body = JSON.parse((opts!.body as string));
    expect(body.chat_id).toBe(12345);
    expect(body.text).toBe("请先确认您是本人后我们继续沟通。");
    expect(body.reply_markup).toEqual({
      inline_keyboard: [
        [{ text: "我确认是本人", callback_data: "verify:12345" }],
      ],
    });
  });

  it("accepts string chat_id and uses it in callback_data", async () => {
    await sendVerifyButton("99999", stubEnv());

    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.chat_id).toBe("99999");
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("verify:99999");
  });

  it("does not throw on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, description: "server error" }),
    } as unknown as Response);
    await expect(sendVerifyButton(123, stubEnv())).resolves.not.toThrow();
  });
});

describe("answerCallbackQuery", () => {
  it("POSTs to answerCallbackQuery endpoint with alert text", async () => {
    await answerCallbackQuery("query_abc", "已加入白名单", stubEnv());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${REAL_API}/bottest_token/answerCallbackQuery`);
    const body = JSON.parse((opts!.body as string));
    expect(body.callback_query_id).toBe("query_abc");
    expect(body.text).toBe("已加入白名单");
    expect(body.show_alert).toBe(true);
  });

  it("sends without text/show_alert when text is undefined", async () => {
    await answerCallbackQuery("query_xyz", undefined, stubEnv());

    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.callback_query_id).toBe("query_xyz");
    expect(body.text).toBeUndefined();
    expect(body.show_alert).toBeUndefined();
  });

  it("does not throw on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, description: "server error" }),
    } as unknown as Response);
    await expect(answerCallbackQuery("q", "msg", stubEnv())).resolves.not.toThrow();
  });
});

describe("copyMessageToOwner", () => {
  it("uses sendMessage when isText=true, sending prefix as text", async () => {
    await copyMessageToOwner(999, 123, 10, "[from @x · chat_id=123]", stubEnv(), true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${REAL_API}/bottest_token/sendMessage`);
    const body = JSON.parse((opts!.body as string));
    expect(body.chat_id).toBe(999);
    expect(body.text).toBe("[from @x · chat_id=123]");
  });

  it("uses copyMessage when isText=false, putting prefix in caption", async () => {
    await copyMessageToOwner(999, 123, 10, "[from @y · chat_id=456]", stubEnv(), false);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${REAL_API}/bottest_token/copyMessage`);
    const body = JSON.parse((opts!.body as string));
    expect(body.chat_id).toBe(999);
    expect(body.from_chat_id).toBe(123);
    expect(body.message_id).toBe(10);
    expect(body.caption).toBe("[from @y · chat_id=456]");
  });

  it("does not throw on fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, description: "server error" }),
    } as unknown as Response);
    await expect(
      copyMessageToOwner(1, 2, 3, "prefix", stubEnv(), true)
    ).resolves.not.toThrow();
  });
});
