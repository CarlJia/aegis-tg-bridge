import { getEnv } from "./config";
import { handleWebhook } from "./router/webhook";

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
// scheduled handler — cron entry point (U8+ will add summary logic)
// ---------------------------------------------------------------------------
async function scheduled(event: unknown, env: unknown): Promise<void> {
  const evt = event as { cron?: string };
  console.log("scheduled", evt.cron);
}

// Default export required by vitest-pool-workers SELF binding
export default { fetch, scheduled };

// Named exports for Workers modules format
export { fetch, scheduled };
