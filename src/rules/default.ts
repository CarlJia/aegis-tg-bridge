/**
 * 默认规则常量 — 关键词、链接、营销前缀
 *
 * 规则顺序（evaluate 时按此顺序短路）：
 *   1. keywords   — 大小写不敏感的正则匹配
 *   2. links      — URL host 后缀黑名单
 *   3. marketing_prefixes — 消息开头的营销话术（前缀匹配，大小写不敏感）
 */

// ---------------------------------------------------------------------------
// DefaultRules shape
// ---------------------------------------------------------------------------
export interface DefaultRules {
  keywords: string[];
  links: { hosts: string[] };
  marketing_prefixes: string[];
}

// ---------------------------------------------------------------------------
// Default rule constants
// ---------------------------------------------------------------------------

/** 关键词正则模式（编译时转为大小写不敏感的 RegExp） */
export const KEYWORD_PATTERNS: string[] = [
  "usdt 搬砖",
  "USDT 搬砖",
  "BTC 套利",
  "以太坊 搬砖",
  "日入过千",
  "日入过万",
  "兼职刷单",
  "点赞刷单",
  "招嫖",
  "博彩",
  "赌博",
  "赌场",
  "网赌",
  "代孕",
  "代考",
  "重金求子",
];

/** 链接黑名单 — 匹配 host 等于或以 . 开头后接这些后缀 */
export const LINK_HOSTS: string[] = [
  "bit.ly",
  "t.co",
  "goo.gl",
  "rebrand.ly",
  "tinyurl.com",
];

/** 营销前缀话术 — 匹配消息开头，大小写不敏感 */
export const MARKETING_PREFIXES: string[] = [
  "您好,我是",
  "您好，我是",
  "Hi,我",
  "亲爱的",
  "老板好",
  "您好,请问需要",
  "合作愉快",
  "加我微信",
  "加 V",
];

// ---------------------------------------------------------------------------
// DEFAULT_RULES — 编译前原始数据（engine.ts 负责编译成 RegExp）
// ---------------------------------------------------------------------------
export const DEFAULT_RULES: DefaultRules = {
  keywords: KEYWORD_PATTERNS,
  links: { hosts: LINK_HOSTS },
  marketing_prefixes: MARKETING_PREFIXES,
};

// ---------------------------------------------------------------------------
// resolveRules — merge a KV override payload onto the defaults
// ---------------------------------------------------------------------------

/**
 * 把 KV `bot:rules` 的 payload 合并到默认规则上：提供了的字段整体替换默认，
 * 未提供或类型不对的字段回退默认。
 *
 * 用逐字段 `Array.isArray` 守卫而非对象展开 —— KV 里可能存着历史形状或
 * 脏数据（例如 legacy 的扁平 `links: string[]`、显式 `null`），展开会把它们
 * 原样带进来，`links: null` 会让 compile() 在 `rules.links.hosts` 上抛错。
 * `[]` 是合法覆盖（= 该字段不生效），所以判空必须用 Array.isArray 而非真值判断。
 */
export function resolveRules(
  payload: Partial<DefaultRules> | null | undefined
): DefaultRules {
  if (!payload || typeof payload !== "object") return DEFAULT_RULES;

  const keywords = Array.isArray(payload.keywords)
    ? payload.keywords
    : DEFAULT_RULES.keywords;
  const links = Array.isArray(payload.links?.hosts)
    ? payload.links
    : DEFAULT_RULES.links;
  const marketing_prefixes = Array.isArray(payload.marketing_prefixes)
    ? payload.marketing_prefixes
    : DEFAULT_RULES.marketing_prefixes;

  return { keywords, links, marketing_prefixes };
}
