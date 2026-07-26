// =============================================================================
// global-setup.ts — run before all tests to prepare the test SQLite database
// =============================================================================

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

export function setup(): void {
  const dbPath = resolve(process.cwd(), "prisma", "test.db");

  // Remove the old test database so we start from a clean state
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  // Also remove the WAL/journal files that SQLite may create
  for (const suffix of ["-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }

  // Push the schema to the test database
  // Note: we use prisma db push (not migrate) so we don't need migration files for tests.
  // Prisma client must be pre-generated before running tests (pnpm db:generate).
  execSync("pnpm exec prisma db push --skip-generate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}

export function teardown(): void {
  // Clean up the test database after all tests complete
  const dbPath = resolve(process.cwd(), "prisma", "test.db");
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
  for (const suffix of ["-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }
}
