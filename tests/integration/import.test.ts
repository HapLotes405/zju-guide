// =============================================================================
// import.test.ts — integration tests for POST/GET /api/me/imports
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as importPostHandler, GET as importGetHandler } from "@/app/api/me/imports/route";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";
import { createRequest } from "../test-utils";

// Reuse the valid-import fixture
import validImport from "../../fixtures/valid-import.json";
import oldSchema from "../../fixtures/old-schema.json";
import duplicateImport from "../../fixtures/duplicate-import.json";
import missingFields from "../../fixtures/missing-fields.json";

// ---------------------------------------------------------------------------
// Setup & teardown
// ---------------------------------------------------------------------------

let userToken: string;
let userId: string;

beforeAll(async () => {
  // Clean in FK-safe order
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

  const user = await prisma.user.create({
    data: {
      username: "importuser",
      passwordHash: hashPassword("importpass"),
    },
  });

  userId = user.id;
  userToken = await signToken({ sub: user.id, role: user.role });
});

beforeEach(async () => {
  // Clean import-related data between tests (FK-safe order)
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
  // Do NOT delete the user — created in beforeAll, needed for all tests
});

afterAll(async () => {
  await prisma.$disconnect();
});

// =============================================================================
// POST /api/me/imports — success cases
// =============================================================================

describe("POST /api/me/imports", () => {
  it("imports valid new-format JSON and returns 201", async () => {
    const req = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: validImport,
      token: userToken,
    });

    const res = await importPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toBeDefined();
    expect(json.data.importId).toBeDefined();
    expect(json.data.coursesAdded).toBeGreaterThan(0);
    expect(json.data.courses).toBeDefined();
    expect(Array.isArray(json.data.courses)).toBe(true);

    // All courses should be "added" on first import
    for (const c of json.data.courses) {
      expect(c.status).toBe("added");
    }

    // Verify courses were actually inserted
    const courseRecords = await prisma.courseRecord.findMany({
      where: { userId },
    });
    expect(courseRecords.length).toBe(json.data.coursesAdded);

    // Verify an audit log entry was created
    const auditLogs = await prisma.auditLog.findMany({
      where: { userId, action: "IMPORT_CONFIRMED" },
    });
    expect(auditLogs.length).toBe(1);
  });

  it("skips duplicate courses on re-import (idempotent)", async () => {
    // First import
    const req1 = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: validImport,
      token: userToken,
    });
    const res1 = await importPostHandler(req1);
    const json1 = await res1.json();

    expect(res1.status).toBe(201);
    const firstAdded = json1.data.coursesAdded;

    // Second import of the same data
    const req2 = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: validImport,
      token: userToken,
    });
    const res2 = await importPostHandler(req2);
    const json2 = await res2.json();

    expect(res2.status).toBe(201);
    expect(json2.data.coursesAdded).toBe(0);
    expect(json2.data.coursesSkipped).toBe(firstAdded);

    // All courses should be "skipped" on re-import
    for (const c of json2.data.courses) {
      expect(c.status).toBe("skipped");
    }

    // Course records should not have duplicated
    const courseRecords = await prisma.courseRecord.findMany({
      where: { userId },
    });
    expect(courseRecords.length).toBe(firstAdded);
  });

  it("handles partial duplicate — adds new, skips existing", async () => {
    // First import with valid-import
    const req1 = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: validImport,
      token: userToken,
    });
    await importPostHandler(req1);

    // Second import with duplicate-import (some overlap, some new)
    const req2 = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: duplicateImport,
      token: userToken,
    });
    const res2 = await importPostHandler(req2);
    const json2 = await res2.json();

    expect(res2.status).toBe(201);
    // duplicate-import has MATH1135G (already imported) and PHY1001G (new)
    expect(json2.data.coursesAdded).toBe(1);
    expect(json2.data.coursesSkipped).toBe(1);

    const addedCourse = json2.data.courses.find(
      (c: { status: string }) => c.status === "added",
    );
    expect(addedCourse.code).toBe("PHY1001G");
  });

  it("accepts old-format (v0.5) JSON", async () => {
    const req = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: oldSchema,
      token: userToken,
    });

    const res = await importPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.coursesAdded).toBeGreaterThan(0);
    expect(json.data.importId).toBeDefined();

    // Verify the import record stores the old schema version
    const importRecord = await prisma.sourceImport.findFirst({
      where: { id: json.data.importId },
    });
    expect(importRecord!.schemaVersion).toBe("0.5");
  });

  it("creates Course records if they did not exist", async () => {
    const req = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: validImport,
      token: userToken,
    });

    await importPostHandler(req);

    // Verify courses were created
    const mathCourse = await prisma.course.findUnique({
      where: { code: "MATH1135G" },
    });
    expect(mathCourse).not.toBeNull();
    expect(mathCourse!.name).toBe("微积分(甲)I");
    expect(mathCourse!.credits).toBe(5.0);
  });
});

// =============================================================================
// POST /api/me/imports — error cases
// =============================================================================

describe("POST /api/me/imports — errors", () => {
  it("returns 401 without auth token", async () => {
    const req = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: validImport,
      // no token
    });

    const res = await importPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when body is not valid JSON", async () => {
    // Send a body that fails JSON.parse in the handler
    const req = new NextRequest("http://localhost/api/me/imports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: "this is not json",
    });

    const res = await importPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_JSON");
  });

  it("returns 422 when schema is invalid (missing required fields)", async () => {
    const req = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: missingFields,
      token: userToken,
    });

    const res = await importPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error.code).toBe("INVALID_SCHEMA");
  });

  it("returns 422 for completely unrecognized JSON shape", async () => {
    const req = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: { foo: "bar", baz: 123 },
      token: userToken,
    });

    const res = await importPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.error.code).toBe("INVALID_SCHEMA");
  });
});

// =============================================================================
// GET /api/me/imports
// =============================================================================

describe("GET /api/me/imports", () => {
  it("returns import history for authenticated user", async () => {
    // First create an import
    const postReq = createRequest("http://localhost/api/me/imports", {
      method: "POST",
      body: validImport,
      token: userToken,
    });
    await importPostHandler(postReq);

    // Then fetch history
    const getReq = createRequest("http://localhost/api/me/imports", {
      token: userToken,
    });

    const res = await importGetHandler(getReq);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toBeDefined();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBe(1);

    const importEntry = json.data[0];
    expect(importEntry.id).toBeDefined();
    expect(importEntry.schemaVersion).toBe("1.0");
    expect(importEntry.importedAt).toBeDefined();
    expect(importEntry.rawJson).toBeDefined();
  });

  it("imports are ordered by most recent first", async () => {
    // Create two imports
    for (const body of [validImport, duplicateImport]) {
      const req = createRequest("http://localhost/api/me/imports", {
        method: "POST",
        body,
        token: userToken,
      });
      await importPostHandler(req);
    }

    const getReq = createRequest("http://localhost/api/me/imports", {
      token: userToken,
    });

    const res = await importGetHandler(getReq);
    const json = await res.json();

    expect(json.data.length).toBe(2);
    // Most recent first
    expect(
      new Date(json.data[0].importedAt).getTime(),
    ).toBeGreaterThanOrEqual(
      new Date(json.data[1].importedAt).getTime(),
    );
  });

  it("returns empty array when user has no imports", async () => {
    const getReq = createRequest("http://localhost/api/me/imports", {
      token: userToken,
    });

    const res = await importGetHandler(getReq);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });

  it("returns 401 without auth token", async () => {
    const req = createRequest("http://localhost/api/me/imports");

    const res = await importGetHandler(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });
});
