// =============================================================================
// courses.test.ts — integration tests for /api/courses (list & detail)
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { GET as coursesListHandler } from "@/app/api/courses/route";
import { GET as courseDetailHandler } from "@/app/api/courses/[code]/route";
import { prisma } from "@/lib/prisma";
import { createRequest } from "../test-utils";

// ---------------------------------------------------------------------------
// Setup: seed courses into the test database
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Clean and seed courses (FK-safe order)
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

  // Create a program version
  const programVersion = await prisma.programVersion.create({
    data: {
      majorName: "计算机科学与技术",
      year: 2025,
      totalCredits: 160,
      isActive: true,
    },
  });

  // Create courses
  await prisma.course.createMany({
    data: [
      { code: "CS101", name: "程序设计基础", credits: 4.0, department: "计算机学院", semester: "大一上" },
      { code: "CS102", name: "离散数学", credits: 3.0, department: "计算机学院", semester: "大一下" },
      { code: "CS201", name: "数据结构", credits: 4.0, department: "计算机学院", semester: "大二上" },
      { code: "CS202", name: "计算机组成", credits: 4.0, department: "计算机学院", semester: "大二上" },
      { code: "CS301", name: "操作系统", credits: 4.0, department: "计算机学院", semester: "大三上" },
      { code: "MATH101", name: "高等数学", credits: 5.0, department: "数学学院", semester: "大一上" },
      { code: "CS101P", name: "程序设计基础实验", credits: 1.0, department: "计算机学院", semester: "大一上" },
    ],
  });

  // Link courses to the program version
  const programCourses = [
    { code: "CS101", semester: 1, compulsory: true },
    { code: "CS102", semester: 2, compulsory: true },
    { code: "CS201", semester: 3, compulsory: true },
    { code: "CS202", semester: 3, compulsory: true },
    { code: "CS301", semester: 5, compulsory: true },
    { code: "MATH101", semester: 1, compulsory: true },
  ];

  for (const pc of programCourses) {
    await prisma.programCourse.create({
      data: {
        programVersionId: programVersion.id,
        courseCode: pc.code,
        suggestedSemester: pc.semester,
        isCompulsory: pc.compulsory,
      },
    });
  }

  // Create prerequisites: CS201 requires CS101
  await prisma.coursePrerequisite.create({
    data: {
      courseCode: "CS201",
      prerequisiteCode: "CS101",
      relationType: "PREREQUISITE",
      reason: "需要编程基础",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// =============================================================================
// GET /api/courses — list
// =============================================================================

describe("GET /api/courses", () => {
  it("returns a paginated list of all courses", async () => {
    const req = createRequest("http://localhost/api/courses");

    const res = await coursesListHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toBeDefined();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.pagination).toBeDefined();
    expect(json.pagination.page).toBe(1);
    expect(json.pagination.pageSize).toBe(20);
    expect(json.pagination.total).toBeGreaterThanOrEqual(7);
  });

  it("returns courses sorted by code ascending", async () => {
    const req = createRequest("http://localhost/api/courses");

    const res = await coursesListHandler(req);
    const json = await res.json();

    const codes = json.data.map((c: { code: string }) => c.code);
    for (let i = 1; i < codes.length; i++) {
      expect(codes[i] >= codes[i - 1]).toBe(true);
    }
  });

  it("filters courses by major", async () => {
    const req = createRequest("http://localhost/api/courses", {
      searchParams: { major: "计算机科学与技术" },
    });

    const res = await coursesListHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    // Should only return courses linked to 计算机科学与技术
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data.length).toBeLessThanOrEqual(6); // Only the 6 program-linked courses
  });

  it("filters courses by semester", async () => {
    const req = createRequest("http://localhost/api/courses", {
      searchParams: { semester: "大一上" },
    });

    const res = await coursesListHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.length).toBeGreaterThan(0);
    for (const course of json.data) {
      expect(course.semester).toBe("大一上");
    }
  });

  it("respects pagination with page and pageSize", async () => {
    const req = createRequest("http://localhost/api/courses", {
      searchParams: { page: "1", pageSize: "3" },
    });

    const res = await coursesListHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.length).toBeLessThanOrEqual(3);
    expect(json.pagination.page).toBe(1);
    expect(json.pagination.pageSize).toBe(3);
    expect(json.pagination.total).toBeGreaterThanOrEqual(7);
  });

  it("returns empty data array when page exceeds total", async () => {
    const req = createRequest("http://localhost/api/courses", {
      searchParams: { page: "100", pageSize: "10" },
    });

    const res = await coursesListHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(json.pagination.total).toBeGreaterThan(0);
  });

  it("clamps pageSize to max 500", async () => {
    const req = createRequest("http://localhost/api/courses", {
      searchParams: { pageSize: "999" },
    });

    const res = await coursesListHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.pagination.pageSize).toBe(500);
    expect(json.data.length).toBeLessThanOrEqual(500);
  });

  it("each course has expected fields", async () => {
    const req = createRequest("http://localhost/api/courses");

    const res = await coursesListHandler(req);
    const json = await res.json();

    const firstCourse = json.data[0];
    expect(firstCourse.code).toBeDefined();
    expect(firstCourse.name).toBeDefined();
    expect(firstCourse.credits).toBeDefined();
    expect(firstCourse.department).toBeDefined();
  });
});

// =============================================================================
// GET /api/courses/[code] — detail
// =============================================================================

describe("GET /api/courses/[code]", () => {
  it("returns full course detail including prerequisites and programs", async () => {
    const req = createRequest("http://localhost/api/courses/CS201");
    const res = await courseDetailHandler(req, {
      params: Promise.resolve({ code: "CS201" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toBeDefined();
    expect(json.data.code).toBe("CS201");
    expect(json.data.name).toBe("数据结构");
    expect(json.data.credits).toBe(4.0);
    expect(json.data.department).toBe("计算机学院");

    // Prerequisites: CS201 should have CS101 as prerequisite
    expect(json.data.prerequisites).toBeDefined();
    expect(Array.isArray(json.data.prerequisites)).toBe(true);
    expect(json.data.prerequisites.length).toBeGreaterThan(0);

    const prereq = json.data.prerequisites.find(
      (p: { code: string }) => p.code === "CS101",
    );
    expect(prereq).toBeDefined();
    expect(prereq.name).toBe("程序设计基础");
    expect(prereq.relationType).toBe("PREREQUISITE");

    // Programs: should list 计算机科学与技术
    expect(json.data.programs).toBeDefined();
    expect(Array.isArray(json.data.programs)).toBe(true);
    const program = json.data.programs.find(
      (p: { majorName: string }) => p.majorName === "计算机科学与技术",
    );
    expect(program).toBeDefined();
    expect(program.year).toBe(2025);
  });

  it("returns 404 for non-existent course code", async () => {
    const req = createRequest("http://localhost/api/courses/ZZZZ999");
    const res = await courseDetailHandler(req, {
      params: Promise.resolve({ code: "ZZZZ999" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns empty prerequisites for a course with no dependencies", async () => {
    const req = createRequest("http://localhost/api/courses/CS101");
    const res = await courseDetailHandler(req, {
      params: Promise.resolve({ code: "CS101" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.prerequisites).toEqual([]);
    // CS101 is a prerequisite for CS201, so it should have dependents
    expect(json.data.dependents.length).toBeGreaterThan(0);

    const dependent = json.data.dependents.find(
      (d: { code: string }) => d.code === "CS201",
    );
    expect(dependent).toBeDefined();
    expect(dependent.name).toBe("数据结构");
  });

  it("course detail includes dependents field", async () => {
    const req = createRequest("http://localhost/api/courses/CS101");
    const res = await courseDetailHandler(req, {
      params: Promise.resolve({ code: "CS101" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.data.dependents)).toBe(true);
  });
});
