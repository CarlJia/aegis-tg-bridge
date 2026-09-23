import { getEnv } from "./config";
import { handleWebhook } from "./router/webhook";
import { handleCron } from "./cron/summary";

// ---------------------------------------------------------------------------
// fetch handler — webhook entry point
// ---------------------------------------------------------------------------
async function fetch(request: Request, env: unknown): Promise<Response> {
  const url = new URL(request.url);

  // Health check: GET / — does not require any secrets
  if (url.pathname === "/" && request.method === "GET") {
    return new Response("ok", { status: 200 });
  }

  // Webhook endpoint: POST /webhook — env validated inside handleWebhook
  if (url.pathname === "/webhook" && request.method === "POST") {
    return handleWebhook(request, getEnv(env as Parameters<typeof getEnv>[0]));
  }

  // All other paths: 200 without entering dispatch
  return new Response("not found", { status: 200 });
}

// ---------------------------------------------------------------------------
// scheduled handler — cron entry point (U8)
// ---------------------------------------------------------------------------
async function scheduled(event: unknown, env: unknown, ctx?: { waitUntil?: (p: Promise<unknown>) => void }): Promise<void> {
  const evt = event as { cron?: string };
  const env_ = env as Parameters<typeof getEnv>[0];
  const work = handleCron(env_);
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(work);
  } else {
    await work;
  }
}

// Default export required by vitest-pool-workers SELF binding
export default { fetch, scheduled };

// Named exports for Workers modules format
export { fetch, scheduled };
