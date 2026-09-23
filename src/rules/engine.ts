/**
 * 规则引擎
 *
 * compile(rules) → CompiledEngine
 *   evaluate(text) → { hit: boolean; rule?: 'keywords' | 'links' | 'marketing_prefixes' }
 *
 * 执行顺序（短路）：keywords → links → marketing_prefixes
 * 返回第一个命中的规则。
 */

import type { DefaultRules } from "./default";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuleHit =
  | { hit: false }
  | { hit: true; rule: "keywords" | "links" | "marketing_prefixes" };

export interface CompiledEngine {
  evaluate(text: string): RuleHit;
}

// ---------------------------------------------------------------------------
// ReDoS sanitisation
// ---------------------------------------------------------------------------

/**
 * 检查一个正则表达式 PATTERN 是否安全可以编译。
 * 拒绝包含嵌套量词或易引发 ReDoS 的模式。
 *
 * 拒绝模式示例：
 *   (a+)+  (.*)+  (.+)+  (.+){  (.*){  (a+)*  (.*)*
 *   (.+)*  (.+a){N}
 */
export function sanitize(pattern: string): boolean {
  // Reject nested quantifiers: (X+)+ (X*)+ (X+)* (X*)*
  if (/\([^)]*[+*]\)[+*]/.test(pattern)) return false;

  // Reject overlapping quantifiers: (.+){{N}} or (.+){{N,M}}
  // e.g. (.+){20} — catastrophic backtracking on long input
  if (/\(\.[+*]\)\{/.test(pattern)) return false;

  // Reject patterns where . is quantified followed by a quantified letter group
  // e.g. (.*a){20}
  if (/\(\.\*\w\)\{/.test(pattern)) return false;

  // Accept everything else
  return true;
}

/**
 * 尝试编译一个正则表达式模式。
 * 如果 sanitize 拒绝，则返回 null 并打印警告。
 */
export function compileSafeRegex(pattern: string): RegExp | null {
  if (!sanitize(pattern)) {
    console.warn(`[rules] Pattern rejected by sanitize (potential ReDoS): ${pattern}`);
    return null;
  }
  try {
    return new RegExp(pattern, "i");
  } catch {
    console.warn(`[rules] Invalid regex pattern: ${pattern}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// URL extraction helper
// ---------------------------------------------------------------------------

/** 从文本中提取所有 URL 的 host（去掉 leading www.）。 */
function extractHosts(text: string): string[] {
  const urlRe = /(?:https?:\/\/|www\.)[^\s]+/gi;
  const hosts: string[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex before iteration
  urlRe.lastIndex = 0;

  while ((match = urlRe.exec(text)) !== null) {
    try {
      const raw = match[0];
      // Normalise: prepend https:// if no scheme
      const urlStr = raw.startsWith("www.") ? `https://${raw}` : raw;
      const url = new URL(urlStr);
      let host = url.host;
      if (host.startsWith("www.")) host = host.slice(4);
      hosts.push(host);
    } catch {
      // Not a valid URL — skip
    }
  }
  return hosts;
}

/** 检查 hosts 是否命中黑名单（相等或以 . 开头后接后缀）。 */
function hostsMatchBlocked(seenHosts: string[], blockedHosts: string[]): boolean {
  for (const seen of seenHosts) {
    for (const blocked of blockedHosts) {
      if (seen === blocked || seen.endsWith("." + blocked)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

export function compile(rules: DefaultRules): CompiledEngine {
  // 编译 keywords 为大小写不敏感的正则（每条单独编译）
  const keywordRegexes: RegExp[] = [];
  for (const pattern of rules.keywords) {
    const re = compileSafeRegex(pattern);
    if (re) keywordRegexes.push(re);
  }

  // links: host 列表直接用字符串比较
  const blockedHosts = rules.links.hosts;

  // marketing_prefixes: 转小写存储，匹配时统一转小写
  const lowerPrefixes = rules.marketing_prefixes.map((p) => p.toLowerCase());

  return {
    evaluate(text: string): RuleHit {
      // 1) keywords
      for (const re of keywordRegexes) {
        re.lastIndex = 0; // reset for global regex
        if (re.test(text)) {
          return { hit: true, rule: "keywords" };
        }
      }

      // 2) links — extract hosts and check against blocklist
      const seenHosts = extractHosts(text);
      if (hostsMatchBlocked(seenHosts, blockedHosts)) {
        return { hit: true, rule: "links" };
      }

      // 3) marketing_prefixes — prefix match, case-insensitive
      const lowerText = text.toLowerCase();
      for (const prefix of lowerPrefixes) {
        if (lowerText.startsWith(prefix)) {
          return { hit: true, rule: "marketing_prefixes" };
        }
      }

      return { hit: false };
    },
  };
}

// ---------------------------------------------------------------------------
// Module-level default engine (compiled once at cold start)
// ---------------------------------------------------------------------------

import { DEFAULT_RULES } from "./default";

export const DEFAULT_ENGINE: CompiledEngine = compile(DEFAULT_RULES);

/** 便利函数：使用默认引擎评估一条消息 */
export function evaluateMessage(text: string): RuleHit {
  return DEFAULT_ENGINE.evaluate(text);
}
