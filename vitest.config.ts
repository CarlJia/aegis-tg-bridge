import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";
import type { KVNamespace } from "@cloudflare/workers-types";

// Extend ProvidedEnv to include our KV bindings
declare module "cloudflare:test" {
  interface ProvidedEnv {
    STATE: KVNamespace;
    RULES: KVNamespace;
    SUMMARY: KVNamespace;
  }
}

export default defineWorkersConfig(
  defineConfig({
    test: {
      poolOptions: {
        workers: {
          main: "./src/index.ts",
          miniflare: {
            kvNamespaces: {
              STATE: "00000000-0000-0000-0000-000000000000",
              RULES: "00000000-0000-0000-0000-000000000001",
              SUMMARY: "00000000-0000-0000-0000-000000000002",
            },
            vars: {
              BOT_TOKEN: "test_bot_token",
              WEBHOOK_SECRET: "test_secret",
            },
            compatibilityFlags: ["nodejs_compat", "export_commonjs_default"],
          },
        },
      },
    },
  })
);
