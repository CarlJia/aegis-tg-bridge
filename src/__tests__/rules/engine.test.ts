/**
 * 规则引擎单元测试
 *
 * 运行：pnpm test
 */

import { describe, it, expect } from "vitest";
import { sanitize, compileSafeRegex, evaluateMessage } from "../../rules/engine";
import { compile } from "../../rules/engine";
import { DEFAULT_RULES } from "../../rules/default";

describe("evaluateMessage — keywords", () => {
  // Test scenario 1
  it("matches 'usdt 搬砖 日入过千' → keywords", () => {
    const result = evaluateMessage("usdt 搬砖 日入过千");
    expect(result).toEqual({ hit: true, rule: "keywords" });
  });

  // Test scenario 2
  it("matches 'USDT 搬砖' case-insensitively", () => {
    const result = evaluateMessage("USDT 搬砖");
    expect(result).toEqual({ hit: true, rule: "keywords" });
  });
});

describe("evaluateMessage — links", () => {
  // Test scenario 3
  it("matches bit.ly URL → links", () => {
    const result = evaluateMessage("快来 https://bit.ly/abc 看看");
    expect(result).toEqual({ hit: true, rule: "links" });
  });
});

describe("evaluateMessage — marketing_prefixes", () => {
  // Test scenario 5
  it("matches '加我微信 abc123' → marketing_prefixes", () => {
    const result = evaluateMessage("加我微信 abc123");
    expect(result).toEqual({ hit: true, rule: "marketing_prefixes" });
  });
});

describe("evaluateMessage — no hit", () => {
  // Test scenario 4
  it("returns { hit: false } for clean message", () => {
    const result = evaluateMessage("找我合作,我来自小米,有意向联系");
    expect(result).toEqual({ hit: false });
  });
});

describe("evaluateMessage — order priority (keywords first)", () => {
  // Test scenario 10
  it("keywords checked before links", () => {
    // Both keywords and links would hit, but keywords should win
    const result = evaluateMessage("usdt 搬砖 查看 https://bit.ly/x");
    expect(result).toEqual({ hit: true, rule: "keywords" });
  });
});

describe("sanitize", () => {
  // Test scenario 6
  it("rejects (a+)+", () => {
    expect(sanitize("(a+)+")).toBe(false);
  });

  // Test scenario 7
  it("rejects (.*a){20}", () => {
    expect(sanitize("(.*a){20}")).toBe(false);
  });

  // Test scenario 8
  it("accepts plain keyword patterns like 'usdt 搬砖'", () => {
    expect(sanitize("usdt 搬砖")).toBe(true);
  });
});

describe("compileSafeRegex", () => {
  // Test scenario 9
  it("returns null for ReDoS patterns", () => {
    expect(compileSafeRegex("(a+)+")).toBe(null);
  });

  it("returns a RegExp for safe patterns", () => {
    const re = compileSafeRegex("usdt 搬砖");
    expect(re).not.toBe(null);
    expect(re instanceof RegExp).toBe(true);
  });
});

describe("compile — smoke test", () => {
  it("engine evaluate returns correct shape", () => {
    const engine = compile(DEFAULT_RULES);
    const result = engine.evaluate("博彩广告");
    expect(result).toEqual({ hit: true, rule: "keywords" });
  });
});
