// =============================================================================
// global-setup.ts — run before all tests to prepare the test PostgreSQL database
// =============================================================================

import { execSync } from "node:child_process";

export function setup(): void {
  const databaseUrl =
    process.env.DATABASE_URL ?? "file:./test.db";

  // For SQLite: just check it's a test database
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
