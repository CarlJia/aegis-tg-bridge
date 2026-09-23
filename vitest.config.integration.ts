import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

/**
 * Integration test config — runs end-to-end scenarios against the real Worker
 * entry (fetch + scheduled) with miniflare-backed KV.
 *
 * Unit tests use the default `vitest.config.ts`; this config scopes the run to
 * `tests/integration/` so the two suites can be invoked independently.
 */
export default defineWorkersConfig(
  defineConfig({
    test: {
      include: ["tests/integration/**/*.test.ts"],
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
