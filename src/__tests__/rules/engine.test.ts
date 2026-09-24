/**
 * 规则引擎单元测试
 *
 * 运行：pnpm test
 */

import { describe, it, expect } from "vitest";
import { sanitize, compileSafeRegex, evaluateMessage, escapeRegExp } from "../../rules/engine";
import { compile } from "../../rules/engine";
import { DEFAULT_RULES, resolveRules } from "../../rules/default";

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

describe("resolveRules", () => {
  it("null / undefined / {} → defaults", () => {
    expect(resolveRules(null)).toEqual(DEFAULT_RULES);
    expect(resolveRules(undefined)).toEqual(DEFAULT_RULES);
    expect(resolveRules({})).toEqual(DEFAULT_RULES);
  });

  it("[] overrides keywords — empty means no keyword filtering", () => {
    const r = resolveRules({ keywords: [] });
    expect(r.keywords).toEqual([]);
    expect(r.links).toEqual(DEFAULT_RULES.links);
    expect(r.marketing_prefixes).toEqual(DEFAULT_RULES.marketing_prefixes);
  });

  it("partial override: only provided fields replace defaults", () => {
    const r = resolveRules({ keywords: ["foo"] });
    expect(r.keywords).toEqual(["foo"]);
    expect(r.links).toEqual(DEFAULT_RULES.links);
    expect(r.marketing_prefixes).toEqual(DEFAULT_RULES.marketing_prefixes);
  });

  it("non-array keywords falls back to default", () => {
    const r = resolveRules({ keywords: "oops" } as unknown as { keywords: string[] });
    expect(r.keywords).toEqual(DEFAULT_RULES.keywords);
  });

  it("legacy flat links string[] falls back to default", () => {
    const r = resolveRules({ links: ["x.com"] } as unknown as { links: { hosts: string[] } });
    expect(r.links).toEqual(DEFAULT_RULES.links);
  });
});

describe("escapeRegExp / literal keyword matching", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegExp("1.5")).toBe("1\\.5");
    expect(escapeRegExp("a+b")).toBe("a\\+b");
  });

  it("'.' matches literally, not as any-char", () => {
    const engine = compile({ ...DEFAULT_RULES, keywords: ["1.5"] });
    expect(engine.evaluate("价格 1.5 元")).toEqual({ hit: true, rule: "keywords" });
    expect(engine.evaluate("价格 1x5 元")).toEqual({ hit: false });
  });

  it("matches 'C++' literally without a regex error", () => {
    const engine = compile({ ...DEFAULT_RULES, keywords: ["C++"] });
    expect(engine.evaluate("学 C++ 吗")).toEqual({ hit: true, rule: "keywords" });
  });
});
