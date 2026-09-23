/**
 * Summary-queue cleanup — U8
 *
 * Deletes `bot:summary_queue:{date}` keys older than the retention window.
 * Runs on every cron tick; cheap because the key space is one per day.
 */

const KEEP_DAYS = 7;

function dateKey(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Delete summary keys older than KEEP_DAYS days (by UTC date key).
 * Returns the list of deleted keys (useful for tests).
 */
export async function cleanupOldSummaries(
  kv: KVNamespace,
  now: Date = new Date()
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000);
  const cutoffKey = dateKey(cutoff);

  const deleted: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await kv.list({ prefix: "bot:summary_queue:", cursor });
    for (const key of listed.keys) {
      const date = key.name.slice("bot:summary_queue:".length);
      if (date < cutoffKey) {
        await kv.delete(key.name);
        deleted.push(key.name);
      }
    }
    cursor = listed.list_complete ? undefined : (listed.cursor as string | undefined);
  } while (cursor);

  return deleted;
}
