// =============================================================================
// global-setup.ts — run before all tests to prepare the test PostgreSQL database
// =============================================================================

import { execSync } from "node:child_process";

export function setup(): void {
  // vitest `env` 配置只注入测试文件进程，不注入 global-setup；
  // 因此这里显式回退到 postgres 测试库，避免误用 .env 中的 dev 库。
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://msewiki:msewiki@127.0.0.1:5432/msewiki_test";

  // Safety check: only ever touch a test database
  if (!databaseUrl.includes("test")) {
    throw new Error(
      `Refusing to reset non-test database '${databaseUrl}'`,
    );
  }

  // Use regular push (not force-reset) to preserve test data between test files
  execSync("pnpm exec prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}

export function teardown(): void {}
