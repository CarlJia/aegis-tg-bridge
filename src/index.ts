import { getEnv } from "./config";

// ---------------------------------------------------------------------------
// fetch handler — webhook entry point (U2+ will add routing)
// ---------------------------------------------------------------------------
export async function fetch(
  request: Request,
  env: unknown
): Promise<Response> {
  // U2+ will add webhook routing here — for now return 200
  return new Response("ok", { status: 200 });
}

// ---------------------------------------------------------------------------
// scheduled handler — cron entry point (U8+ will add summary logic)
// ---------------------------------------------------------------------------
export async function scheduled(
  _event: unknown,
  _env: unknown
): Promise<void> {
  // U8+ will add daily summary dispatch here
}
