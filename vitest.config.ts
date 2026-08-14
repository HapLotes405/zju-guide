import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "全自动",
    },
    globalSetup: ["./tests/global-setup.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
