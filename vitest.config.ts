import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    env: {
      DATABASE_URL: "postgresql://msewiki:msewiki@127.0.0.1:5432/msewiki_test",
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "全自动",
    },
    globalSetup: ["./tests/global-setup.ts"],
    exclude: [".claude/**", "tests/e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
