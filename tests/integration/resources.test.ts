// =============================================================================
// resources.test.ts — integration tests for resource classification (四格分类)
//   覆盖：课程资源列表（仅已审核 + 带适用阶段） / POST 投稿对
//   applicableStage 的新分类校验（平时学习/小测/期中/期末）
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { ResourceType, ResourceStatus } from "@prisma/client";
import { GET as courseResourcesHandler } from "@/app/api/courses/[code]/resources/route";
import { POST as resourcesPostHandler } from "@/app/api/resources/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { createRequest, createTestUser, seedCourse } from "../test-utils";

let contributorId: string;
let contributorToken: string;
let visitorToken: string;

beforeAll(async () => {
  // 贡献者：用于投稿
  const contributor = await createTestUser("resource_contributor");
  await prisma.user.update({
    where: { id: contributor.id },
    data: { role: "CONTRIBUTOR" },
  });
  contributorId = contributor.id;
  contributorToken = await signToken({
    sub: contributor.id,
    role: "CONTRIBUTOR",
  });

  // 访客：用于验证权限拒绝
  const visitor = await createTestUser("resource_visitor");
  visitorToken = visitor.token;
});

beforeEach(async () => {
  // 每个用例独立：按外键顺序清空资源相关表 + 课程依赖表后种入课程。
  // 保留 user（requireAuth 只校验 JWT，不查库；删除会破坏 GET 的 submitter join）。
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
  await seedCourse({ code: "CS101" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// 便捷 helper：直接创建一条资源并关联到 CS101
async function createLinkedResource(
  data: Partial<{
    title: string;
    type: string;
    applicableStage: string | null;
    status: string;
  }>,
) {
  const resource = await prisma.resource.create({
    data: {
      title: data.title ?? "测试资源",
      type: (data.type as ResourceType | undefined) ?? "LECTURE_NOTE",
      applicableStage: data.applicableStage ?? null,
      status: (data.status as ResourceStatus | undefined) ?? "APPROVED",
      submitterId: contributorId,
    },
  });
  await prisma.courseResource.create({
    data: { resourceId: resource.id, courseCode: "CS101" },
  });
  return resource;
}

// =============================================================================
// GET /api/courses/[code]/resources — 课程资源列表
// =============================================================================

describe("GET /api/courses/[code]/resources", () => {
  it("只返回已审核资源，并携带适用阶段字段", async () => {
    await createLinkedResource({
      title: "2024 期末真题回忆",
      type: "EXAM_RECALL",
      applicableStage: "FINAL",
      status: "APPROVED",
    });
    // 未审核资源不应出现在列表中
    await createLinkedResource({
      title: "草稿未审核",
      type: "LECTURE_NOTE",
      applicableStage: "QUIZ",
      status: "DRAFT",
    });

    const req = createRequest("http://localhost/api/courses/CS101/resources");
    const res = await courseResourcesHandler(req, {
      params: Promise.resolve({ code: "CS101" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].title).toBe("2024 期末真题回忆");
    expect(json.data[0].applicableStage).toBe("FINAL");
    expect(json.data[0].submitterName).toBe("resource_contributor");
  });

  it("无资源时返回空数组", async () => {
    const req = createRequest("http://localhost/api/courses/CS101/resources");
    const res = await courseResourcesHandler(req, {
      params: Promise.resolve({ code: "CS101" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });

  it("不返回 DRAFT 状态的资源", async () => {
    await createLinkedResource({
      title: "待审核资源",
      type: "OTHER",
      applicableStage: "MIDTERM",
      status: "DRAFT",
    });

    const req = createRequest("http://localhost/api/courses/CS101/resources");
    const res = await courseResourcesHandler(req, {
      params: Promise.resolve({ code: "CS101" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });
});

// =============================================================================
// POST /api/resources — applicableStage 新分类校验
// =============================================================================

describe("POST /api/resources — applicableStage 新分类校验", () => {
  it.each(["BEFORE", "DURING", "ALL", "INVALID"])(
    "拒绝旧分类/非法阶段：%s",
    async (stage) => {
      const req = createRequest("http://localhost/api/resources", {
        method: "POST",
        token: contributorToken,
        body: {
          title: "测试资源",
          type: "LECTURE_NOTE",
          applicableStage: stage,
          courseCodes: ["CS101"],
        },
      });

      const res = await resourcesPostHandler(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it.each(["COURSE", "QUIZ", "MIDTERM", "FINAL"])(
    "接受新分类：%s",
    async (stage) => {
      const req = createRequest("http://localhost/api/resources", {
        method: "POST",
        token: contributorToken,
        body: {
          title: "测试资源",
          type: "EXAM_RECALL",
          applicableStage: stage,
          courseCodes: ["CS101"],
        },
      });

      const res = await resourcesPostHandler(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.status).toBe("DRAFT");
    },
  );

  it("不传 applicableStage 时允许（落库为 null）", async () => {
    const req = createRequest("http://localhost/api/resources", {
      method: "POST",
      token: contributorToken,
      body: {
        title: "无阶段资源",
        type: "BLOG",
        courseCodes: ["CS101"],
      },
    });

    const res = await resourcesPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe("DRAFT");
  });

  it("访客身份被拒绝（需贡献者及以上）", async () => {
    const req = createRequest("http://localhost/api/resources", {
      method: "POST",
      token: visitorToken,
      body: {
        title: "访客投稿",
        type: "LECTURE_NOTE",
        applicableStage: "COURSE",
        courseCodes: ["CS101"],
      },
    });

    const res = await resourcesPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("未携带有效类型时校验失败", async () => {
    const req = createRequest("http://localhost/api/resources", {
      method: "POST",
      token: contributorToken,
      body: {
        title: "非法类型",
        type: "NOT_A_TYPE",
        courseCodes: ["CS101"],
      },
    });

    const res = await resourcesPostHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
