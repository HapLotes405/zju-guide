// =============================================================================
// test-utils.ts — shared helpers for API integration tests
// =============================================================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";

// ---------------------------------------------------------------------------
// NextRequest factory
// ---------------------------------------------------------------------------

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  searchParams?: Record<string, string>;
}

/**
 * Create a mock NextRequest for testing API route handlers.
 */
export function createRequest(url: string, opts: RequestOptions = {}): NextRequest {
  const fullUrl = new URL(url, "http://localhost");

  if (opts.searchParams) {
    for (const [key, value] of Object.entries(opts.searchParams)) {
      fullUrl.searchParams.set(key, value);
    }
  }

  const headers = new Headers();

  if (opts.token) {
    headers.set("Authorization", `Bearer ${opts.token}`);
  }

  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return new NextRequest(fullUrl, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Create a test user, returning { id, username } and an access token.
 */
export async function createTestUser(
  username = "testuser",
  password = "password123",
): Promise<{ id: string; username: string; token: string; password: string }> {
  // Clean up any existing user with the same username
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
    },
  });

  const token = await signToken({ sub: user.id, role: user.role });

  return { id: user.id, username: user.username, token, password };
}

// ---------------------------------------------------------------------------
// Database cleanup
// ---------------------------------------------------------------------------

/**
 * Clean all tables between tests. Call in beforeEach/afterEach.
 */
export async function cleanDatabase(): Promise<void> {
  // Delete in FK-safe order (children before parents)
  await prisma.review.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.courseResource.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.courseRecord.deleteMany();
  await prisma.sourceImport.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.coursePrerequisite.deleteMany();
  await prisma.programCourse.deleteMany();
  await prisma.requirementGroup.deleteMany();
  await prisma.userProgram.deleteMany();
  await prisma.programVersion.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/**
 * Seed a course into the database for course-related tests.
 */
export async function seedCourse(overrides?: Partial<{
  code: string;
  name: string;
  credits: number;
  department: string;
  category: string;
  semester: string;
}>): Promise<{ code: string }> {
  return prisma.course.create({
    data: {
      code: overrides?.code ?? "CS101",
      name: overrides?.name ?? "计算机科学基础",
      credits: overrides?.credits ?? 4.0,
      department: overrides?.department ?? "计算机学院",
      category: overrides?.category ?? "major_base",
      semester: overrides?.semester ?? "大一上",
    },
    select: { code: true },
  });
}
