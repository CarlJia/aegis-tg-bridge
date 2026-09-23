export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  STATE: KVNamespace;
  RULES: KVNamespace;
  SUMMARY: KVNamespace;
}

export function getEnv(env: Env): Env {
  // Validate required secrets at the boundary of `/webhook` POST handler.
  // Use console.warn rather than throw so test/dev setups with placeholder
  // values can still exercise routing logic; production deploys must set real
  // values via `wrangler secret put`.
  if (!env.WEBHOOK_SECRET) {
    console.warn("[config] WEBHOOK_SECRET missing — webhook auth will reject all requests");
  }
  if (!env.BOT_TOKEN) {
    console.warn("[config] BOT_TOKEN missing — outbound Telegram API calls will fail");
  }
  if (!env.STATE) {
    throw new Error("STATE KV namespace is not bound");
  }
  if (!env.RULES) {
    throw new Error("RULES KV namespace is not bound");
  }
  if (!env.SUMMARY) {
    throw new Error("SUMMARY KV namespace is not bound");
  }
  return env;
}
