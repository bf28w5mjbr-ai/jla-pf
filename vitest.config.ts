import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const envFiles = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(envFiles)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }

  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    test: {
      environment: "happy-dom",
      /** スレッドワーカーにも .env / .env.local を渡す（DB統合テスト用） */
      env: envFiles,
    },
  };
});
