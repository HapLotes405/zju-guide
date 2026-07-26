// =============================================================================
// auth.test.ts — integration tests for /api/auth/register, /login, /me
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as registerHandler } from "@/app/api/auth/register/route";
import { POST as loginHandler } from "@/app/api/auth/login/route";
import { GET as meHandler } from "@/app/api/auth/me/route";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";
import { createRequest } from "../test-utils";

// ---------------------------------------------------------------------------
// Setup & teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Clean up so each test starts in a known state (FK-safe order)
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
});

afterAll(async () => {
  await prisma.$disconnect();
});

// =============================================================================
// POST /api/auth/register
// =============================================================================

describe("POST /api/auth/register", () => {
  it("registers a new user and returns 201 with userId", async () => {
    const req = createRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: { username: "newuser", password: "secret123" },
    });

    const res = await registerHandler(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toBeDefined();
    expect(json.data.userId).toBeDefined();
    expect(typeof json.data.userId).toBe("string");

    // Verify the user actually exists in the database
    const dbUser = await prisma.user.findUnique({
      where: { username: "newuser" },
    });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.username).toBe("newuser");
    expect(dbUser!.role).toBe("VISITOR");
  });

  it("returns 409 when username is already taken", async () => {
    await prisma.user.create({
      data: {
        username: "existinguser",
        passwordHash: hashPassword("secret123"),
      },
    });

    const req = createRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: { username: "existinguser", password: "secret123" },
    });

    const res = await registerHandler(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("USERNAME_TAKEN");
  });

  it("returns 400 when username is too short", async () => {
    const req = createRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: { username: "a", password: "secret123" },
    });

    const res = await registerHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when password is too short", async () => {
    const req = createRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: { username: "validuser", password: "12345" },
    });

    const res = await registerHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when username is missing", async () => {
    const req = createRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: { password: "secret123" },
    });

    const res = await registerHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("trims whitespace from username", async () => {
    const req = createRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: { username: "  trimmeduser  ", password: "secret123" },
    });

    const res = await registerHandler(req);
    expect(res.status).toBe(201);

    const dbUser = await prisma.user.findUnique({
      where: { username: "trimmeduser" },
    });
    expect(dbUser).not.toBeNull();
  });
});

// =============================================================================
// POST /api/auth/login
// =============================================================================

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    // Ensure known user exists for login tests
    await prisma.user.create({
      data: {
        username: "loginuser",
        passwordHash: hashPassword("correctpass"),
      },
    });
  });

  it("returns access and refresh tokens on successful login", async () => {
    const req = createRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: { username: "loginuser", password: "correctpass" },
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.accessToken).toBeDefined();
    expect(json.data.refreshToken).toBeDefined();
    expect(typeof json.data.accessToken).toBe("string");
    expect(json.data.accessToken.length).toBeGreaterThan(0);
  });

  it("returns 401 for incorrect password", async () => {
    const req = createRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: { username: "loginuser", password: "wrongpass" },
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 for non-existent username", async () => {
    const req = createRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: { username: "nonexistent", password: "whatever" },
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 400 when password is missing", async () => {
    const req = createRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: { username: "loginuser" },
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when username is missing", async () => {
    const req = createRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: { password: "correctpass" },
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("issued token can be used to call /me successfully", async () => {
    const loginReq = createRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: { username: "loginuser", password: "correctpass" },
    });

    const loginRes = await loginHandler(loginReq);
    const loginJson = await loginRes.json();
    const token = loginJson.data.accessToken;

    const meReq = createRequest("http://localhost/api/auth/me", { token });
    const meRes = await meHandler(meReq);
    const meJson = await meRes.json();

    expect(meRes.status).toBe(200);
    expect(meJson.data.username).toBe("loginuser");
    expect(meJson.data.role).toBe("VISITOR");
  });
});

// =============================================================================
// GET /api/auth/me
// =============================================================================

describe("GET /api/auth/me", () => {
  let validToken: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        username: "meuser",
        passwordHash: hashPassword("mepassword"),
      },
    });

    validToken = await signToken({ sub: user.id, role: user.role });
  });

  it("returns user profile for authenticated request", async () => {
    const req = createRequest("http://localhost/api/auth/me", { token: validToken });

    const res = await meHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toBeDefined();
    expect(json.data.username).toBe("meuser");
    expect(json.data.role).toBe("VISITOR");
    expect(json.data.id).toBeDefined();
    expect(json.data.createdAt).toBeDefined();
  });

  it("returns 401 without Authorization header", async () => {
    const req = createRequest("http://localhost/api/auth/me");

    const res = await meHandler(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with non-Bearer Authorization header", async () => {
    const badReq = new NextRequest("http://localhost/api/auth/me", {
      headers: { Authorization: "Basic abc123" },
    });

    const res = await meHandler(badReq);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 with an invalid/expired token", async () => {
    const req = createRequest("http://localhost/api/auth/me", {
      token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.fakeSignature",
    });

    const res = await meHandler(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });
});
