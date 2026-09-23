/**
 * Cron summary handler — U8
 *
 * Fires from the Worker `scheduled` export every 5 minutes. For each owner
 * whose local time is at the configured summary hour (within the ±5 min
 * tolerance the floor-slot matching provides), pushes a "今日拦截 X 条"
 * digest and marks the day as sent for idempotency.
 */

import {
  getSummary,
  getLastSummary,
  setLastSummary,
  getUserSettings,
  getOwnerChatId,
  getLastCleanup,
  setLastCleanup,
} from "../kv/store";
import { tgSendMessage } from "../telegram/api";
import { cleanupOldSummaries } from "./cleanup";
import type { Env } from "../config";

const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_SUMMARY_HOUR = 22;

export interface UserSettings {
  timezone?: string;
  summaryTimeHour?: number;
}

/**
 * Compute the current hour-of-day in the owner's timezone using hour12:false
 * per KTD10. Returns null when the timezone string is unusable.
 */
export function localHour(timeZone: string, now: Date = new Date()): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour")?.value;
    if (hourPart === undefined) return null;
    const hour = Number(hourPart);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

/** Current local date in the owner's timezone as YYYY-MM-DD. */
function localDate(timeZone: string, now: Date = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Entry point invoked by the Worker `scheduled` handler.
 * Exported for direct unit testing.
 */
export async function handleCron(env: Env, now: Date = new Date()): Promise<void> {
  const owner = await getOwnerChatId(env.STATE);

  if (owner) {
    const settings = ((await getUserSettings(env.STATE, owner)) ?? {}) as UserSettings;
    const timeZone = settings.timezone ?? DEFAULT_TIMEZONE;
    const targetHour = settings.summaryTimeHour ?? DEFAULT_SUMMARY_HOUR;

    const hour = localHour(timeZone, now);
    if (hour !== null && hour === targetHour) {
      const date = localDate(timeZone, now);

      // Idempotency (KTD4 / R7): skip when this day's digest was already sent.
      const alreadySent = await getLastSummary(env.STATE, owner, date);
      if (!alreadySent) {
        const entries = await getSummary(env.STATE, date);
        const count = entries.length;
        await tgSendMessage(env, owner, `今日拦截 ${count} 条`);
        await setLastSummary(env.STATE, owner, date, Date.now());
      }
    }
  }

  await maybeCleanup(env, now);
}

/**
 * Sweep old summary keys at most once per UTC day. The cron fires every 5
 * minutes; a KV marker keeps the sweep to one list operation per day instead
 * of ~288, and keeps the free-tier list budget free for message handling.
 */
async function maybeCleanup(env: Env, now: Date): Promise<void> {
  const todayUtc = now.toISOString().slice(0, 10);
  const last = await getLastCleanup(env.STATE);
  if (last === todayUtc) return;
  await cleanupOldSummaries(env.STATE, now);
  await setLastCleanup(env.STATE, todayUtc);
}
