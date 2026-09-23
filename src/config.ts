export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  STATE: KVNamespace;
  RULES: KVNamespace;
  SUMMARY: KVNamespace;
}

export function getEnv(env: Env): Env {
  if (!env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not set in environment");
  }
  if (!env.WEBHOOK_SECRET) {
    throw new Error("WEBHOOK_SECRET is not set in environment");
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
