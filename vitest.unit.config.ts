import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests never initialize or reset a database. Route tests mock Prisma.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    globals: true,
    fileParallelism: false,
    include: ["tests/unit/**/*.test.ts"],
    env: {
      JWT_SECRET: "unit-test-secret",
      JWT_REFRESH_SECRET: "unit-test-refresh-secret",
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/isolated_unit_test",
    },
  },
});
