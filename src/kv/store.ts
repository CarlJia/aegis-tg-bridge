export interface SummaryEntry {
  ts: number;
  chat_id: string;
  snippet: string;
  rule_hit: string;
  has_media: boolean;
}

export interface UserSettings {
  timezone: string;
  summaryTimeHour: number;
}

const PREFIX = "bot:";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Reads fail loud: a KV error propagates so the webhook returns 500 and
// Telegram retries the update. Swallowing it would silently degrade the
// whitelist/blacklist gating decisions below, which is worse than a retry.
async function safeGet<T>(
  kv: KVNamespace,
  key: string,
  fallback: T
): Promise<T> {
  const value = await kv.get(key);
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function safeGetRaw(
  kv: KVNamespace,
  key: string
): Promise<string | null> {
  return kv.get(key);
}

// ---------------------------------------------------------------------------
// Whitelist
// ---------------------------------------------------------------------------

export async function getWhitelist(kv: KVNamespace): Promise<string[]> {
  return safeGet(kv, `${PREFIX}whitelist`, []);
}

export async function setWhitelist(
  kv: KVNamespace,
  arr: string[]
): Promise<void> {
  await kv.put(`${PREFIX}whitelist`, JSON.stringify(arr));
}

export async function addToWhitelist(
  kv: KVNamespace,
  chat_id: string
): Promise<void> {
  const list = await getWhitelist(kv);
  if (!list.includes(chat_id)) {
    list.push(chat_id);
    await setWhitelist(kv, list);
  }
}

export async function removeFromWhitelist(
  kv: KVNamespace,
  chat_id: string
): Promise<void> {
  const list = await getWhitelist(kv);
  const idx = list.indexOf(chat_id);
  if (idx !== -1) {
    list.splice(idx, 1);
    await setWhitelist(kv, list);
  }
}

// ---------------------------------------------------------------------------
// Blacklist
// ---------------------------------------------------------------------------

export async function getBlacklist(kv: KVNamespace): Promise<string[]> {
  return safeGet(kv, `${PREFIX}blacklist`, []);
}

export async function addToBlacklist(
  kv: KVNamespace,
  chat_id: string
): Promise<void> {
  const list = await getBlacklist(kv);
  if (!list.includes(chat_id)) {
    list.push(chat_id);
    await kv.put(`${PREFIX}blacklist`, JSON.stringify(list));
  }
}

export async function removeFromBlacklist(
  kv: KVNamespace,
  chat_id: string
): Promise<void> {
  const list = await getBlacklist(kv);
  const idx = list.indexOf(chat_id);
  if (idx !== -1) {
    list.splice(idx, 1);
    await kv.put(`${PREFIX}blacklist`, JSON.stringify(list));
  }
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export interface RulesPayload {
  keywords?: string[];
  links?: string[];
  marketing_prefixes?: string[];
}

export async function getRules(
  kv: KVNamespace
): Promise<RulesPayload | null> {
  const raw = await safeGetRaw(kv, `${PREFIX}rules`);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as RulesPayload;
  } catch {
    return null;
  }
}

export async function setRules(
  kv: KVNamespace,
  rules: RulesPayload,
  expirationTtl?: number
): Promise<void> {
  const opts = expirationTtl ? { expirationTtl } : undefined;
  await kv.put(`${PREFIX}rules`, JSON.stringify(rules), opts);
}

// ---------------------------------------------------------------------------
// Message Map  (TTL 30 days)
// ---------------------------------------------------------------------------

const MSG_MAP_TTL = 60 * 60 * 24 * 30;

export async function getMessageMap(
  kv: KVNamespace,
  message_id: string
): Promise<string | null> {
  return safeGetRaw(kv, `${PREFIX}message_map:${message_id}`);
}

export async function setMessageMap(
  kv: KVNamespace,
  message_id: string,
  value: string,
  expirationTtl?: number
): Promise<void> {
  const ttl = expirationTtl !== undefined && expirationTtl >= 1 ? expirationTtl : MSG_MAP_TTL;
  await kv.put(`${PREFIX}message_map:${message_id}`, value, { expirationTtl: ttl });
}

// ---------------------------------------------------------------------------
// Pending Message ID  (TTL 7 days)
// ---------------------------------------------------------------------------

const PENDING_TTL = 60 * 60 * 24 * 7;

export async function getPendingMessageId(
  kv: KVNamespace,
  chat_id: string
): Promise<string | null> {
  return safeGetRaw(kv, `${PREFIX}pending_buttons:${chat_id}`);
}

export async function setPendingMessageId(
  kv: KVNamespace,
  chat_id: string,
  message_id: string,
  expirationTtl?: number
): Promise<void> {
  const ttl = expirationTtl !== undefined && expirationTtl >= 1 ? expirationTtl : PENDING_TTL;
  await kv.put(`${PREFIX}pending_buttons:${chat_id}`, message_id, {
    expirationTtl: ttl,
  });
}

export async function deletePendingMessageId(
  kv: KVNamespace,
  chat_id: string
): Promise<void> {
  await kv.delete(`${PREFIX}pending_buttons:${chat_id}`);
}

// ---------------------------------------------------------------------------
// Summary Queue  (TTL 7 days)
// ---------------------------------------------------------------------------

const SUMMARY_TTL = 60 * 60 * 24 * 7;

export async function pushSummary(
  kv: KVNamespace,
  date: string,
  entry: SummaryEntry,
  expirationTtl?: number
): Promise<void> {
  const key = `${PREFIX}summary_queue:${date}`;
  const existing = await safeGet<SummaryEntry[]>(kv, key, []);
  const ttl = expirationTtl !== undefined && expirationTtl >= 1 ? expirationTtl : SUMMARY_TTL;
  existing.push(entry);
  await kv.put(key, JSON.stringify(existing), { expirationTtl: ttl });
}

export async function getSummary(
  kv: KVNamespace,
  date: string
): Promise<SummaryEntry[]> {
  return safeGet(kv, `${PREFIX}summary_queue:${date}`, []);
}

// ---------------------------------------------------------------------------
// Last Summary Idempotency Marker  (TTL 8 days)
// ---------------------------------------------------------------------------

const LAST_SUMMARY_TTL = 60 * 60 * 24 * 8;

export async function getLastSummary(
  kv: KVNamespace,
  owner_id: string,
  date: string
): Promise<number | null> {
  const raw = await safeGetRaw(
    kv,
    `${PREFIX}last_summary:${owner_id}:${date}`
  );
  if (raw === null) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

export async function setLastSummary(
  kv: KVNamespace,
  owner_id: string,
  date: string,
  ts: number,
  expirationTtl?: number
): Promise<void> {
  const ttl = expirationTtl !== undefined && expirationTtl >= 1 ? expirationTtl : LAST_SUMMARY_TTL;
  await kv.put(`${PREFIX}last_summary:${owner_id}:${date}`, String(ts), {
    expirationTtl: ttl,
  });
}

// ---------------------------------------------------------------------------
// Owner Chat ID
// ---------------------------------------------------------------------------

export async function getOwnerChatId(kv: KVNamespace): Promise<string | null> {
  return safeGetRaw(kv, `${PREFIX}owner_chat_id`);
}

export async function setOwnerChatId(
  kv: KVNamespace,
  chat_id: string
): Promise<void> {
  await kv.put(`${PREFIX}owner_chat_id`, chat_id);
}

// ---------------------------------------------------------------------------
// User Settings
// ---------------------------------------------------------------------------

export async function getUserSettings(
  kv: KVNamespace,
  owner_id: string
): Promise<UserSettings | null> {
  return safeGet(kv, `${PREFIX}user_settings:${owner_id}`, null);
}

export async function setUserSettings(
  kv: KVNamespace,
  owner_id: string,
  settings: UserSettings
): Promise<void> {
  await kv.put(`${PREFIX}user_settings:${owner_id}`, JSON.stringify(settings));
}
