// =============================================================================
// teachers.test.ts — integration tests for /api/courses/[code]/teachers
// TDD: test first, then implement the handler
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createRequest, cleanDatabase } from "../test-utils";

// Dynamic import — will fail until the route handler exists
let teachersHandler: typeof import("@/app/api/courses/[code]/teachers/route").GET;

beforeAll(async () => {
  // --- Import handler (will throw if file doesn't exist yet — TDD red phase) ---
  const mod = await import("@/app/api/courses/[code]/teachers/route");
  teachersHandler = mod.GET;

  // --- Clean existing data ---
  // teacher 相关表先删（TeacherCourse→Course 外键），其余交给共享的完整清理
  // cleanDatabase 会先删 programCourse 等引用表，避免 course.deleteMany 撞外键
  await prisma.teacherReview.deleteMany();
  await prisma.teacherCourse.deleteMany();
  await prisma.teacher.deleteMany();
  await cleanDatabase();

  // --- Seed test course: MSE2001M 材料科学基础 ---
  await prisma.course.create({
    data: {
      code: "MSE2001M",
      name: "材料科学基础",
      credits: 3.0,
      department: "材料科学与工程学院",
    },
  });

  // --- Seed 2 test teachers ---
  const t1 = await prisma.teacher.create({
    data: {
      name: "韩国民",
      department: "材料科学与工程学院",
      school: "浙江大学",
      score: 6.2,
      ratingCount: 64,
      rollCallPct: 68.8,
    },
  });

  const t2 = await prisma.teacher.create({
    data: {
      name: "陈立军",
      department: "材料科学与工程学院",
      school: "浙江大学",
      score: 3.2,
      ratingCount: 14,
      rollCallPct: 71.4,
    },
  });

  // --- Seed teacher-course links ---
  await prisma.teacherCourse.create({
    data: { teacherId: t1.id, courseCode: "MSE2001M", gpa: 3.29, studentCount: 360 },
  });
  await prisma.teacherCourse.create({
    data: { teacherId: t2.id, courseCode: "MSE2001M", gpa: 3.33, studentCount: 295 },
  });

  // --- Seed sample reviews ---
  await prisma.teacherReview.create({
    data: {
      teacherId: t1.id,
      content: "韩老师上课完全按照教材，讲得比较传统。给分中规中矩，平时分90左右，期末考是关键。",
      likes: 25,
      date: "2022.06.22",
    },
  });
  await prisma.teacherReview.create({
    data: {
      teacherId: t1.id,
      content: "老师比较传统，上课会抽人回答问题当作点名，旷课扣10分。",
      likes: 18,
      date: "2022.01.15",
    },
  });
  await prisma.teacherReview.create({
    data: {
      teacherId: t2.id,
      content: "老师人很好，给分也不错，但课堂比较无聊。",
      likes: 12,
      date: "2023.06.10",
    },
  });
});

afterAll(async () => {
  await prisma.teacherReview.deleteMany();
  await prisma.teacherCourse.deleteMany();
  await prisma.teacher.deleteMany();
  await cleanDatabase();
  await prisma.$disconnect();
});

// =============================================================================
// GET /api/courses/[code]/teachers
// =============================================================================

describe("GET /api/courses/[code]/teachers", () => {
  it("returns teacher list for a valid course code", async () => {
    const req = createRequest("http://localhost/api/courses/MSE2001M/teachers");
    const res = await teachersHandler(req, {
      params: Promise.resolve({ code: "MSE2001M" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toBeDefined();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBe(2);
  });

  it("each teacher has required fields", async () => {
    const req = createRequest("http://localhost/api/courses/MSE2001M/teachers");
    const res = await teachersHandler(req, {
      params: Promise.resolve({ code: "MSE2001M" }),
    });
    const json = await res.json();

    const teacher = json.data[0];
    expect(teacher.id).toBeDefined();
    expect(teacher.name).toBeDefined();
    expect(teacher.department).toBe("材料科学与工程学院");
    expect(typeof teacher.score).toBe("number");
    expect(typeof teacher.ratingCount).toBe("number");

    // courses array
    expect(Array.isArray(teacher.courses)).toBe(true);
    expect(teacher.courses.length).toBeGreaterThan(0);
    const tc = teacher.courses[0];
    expect(tc.courseCode).toBe("MSE2001M");
    expect(tc.courseName).toBeDefined();
    expect(typeof tc.gpa).toBe("number");
    expect(typeof tc.studentCount).toBe("number");

    // reviews array
    expect(Array.isArray(teacher.reviews)).toBe(true);
    expect(teacher.reviews.length).toBeGreaterThan(0);
    const review = teacher.reviews[0];
    expect(review.content).toBeDefined();
    expect(typeof review.likes).toBe("number");
  });

  it("teachers are sorted by score descending (higher score first)", async () => {
    const req = createRequest("http://localhost/api/courses/MSE2001M/teachers");
    const res = await teachersHandler(req, {
      params: Promise.resolve({ code: "MSE2001M" }),
    });
    const json = await res.json();

    const scores = json.data.map((t: { score: number }) => t.score);
    // First teacher has higher score (6.2 > 3.2)
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  it("returns first teacher with correct data: 韩国民, score 6.2", async () => {
    const req = createRequest("http://localhost/api/courses/MSE2001M/teachers");
    const res = await teachersHandler(req, {
      params: Promise.resolve({ code: "MSE2001M" }),
    });
    const json = await res.json();

    const top = json.data[0];
    expect(top.name).toBe("韩国民");
    expect(top.score).toBe(6.2);
    expect(top.ratingCount).toBe(64);
    expect(top.rollCallPct).toBe(68.8);
    expect(top.reviews.length).toBe(2);
  });

  it("returns empty array for course with no teachers", async () => {
    // Seed a course with no teachers
    await prisma.course.create({
      data: { code: "EMPTY999", name: "无教师课程", credits: 1.0 },
    });

    const req = createRequest("http://localhost/api/courses/EMPTY999/teachers");
    const res = await teachersHandler(req, {
      params: Promise.resolve({ code: "EMPTY999" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });

  it("returns empty array for non-existent course", async () => {
    const req = createRequest("http://localhost/api/courses/ZZZZ999/teachers");
    const res = await teachersHandler(req, {
      params: Promise.resolve({ code: "ZZZZ999" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });
});
