// =============================================================================
// files.test.ts — /api/files/[name] 附件门禁测试
//   规则：APPROVED 资源附件公开下载；未审核（DRAFT 等）附件仅管理员可读
//   磁盘上不存在文件 → 门禁通过后返回 404；本测试用状态码区分"门禁"与"文件存在"
//   注意：与其它集成测试共用同一测试库，这里每个用例做全表清理 + 重建用户，
//   避免跨文件外键残留与用户被清导致的相互干扰。
// =============================================================================

import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { GET as fileGetHandler } from "@/app/api/files/[name]/route";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { createRequest, seedCourse } from "../test-utils";

let adminId: string;
let adminToken: string;
let visitorToken: string;

beforeEach(async () => {
  // 全表清理（外键安全顺序），覆盖其它测试文件可能残留的引用
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
  await prisma.teacherCourse.deleteMany();
  await prisma.teacherReview.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.courseExamPrep.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  // 重建用户与课程（不依赖跨文件状态）
  const admin = await prisma.user.create({
    data: { username: "files_admin", passwordHash: "x" },
  });
  await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  adminId = admin.id;
  adminToken = await signToken({ sub: admin.id, role: "ADMIN" });

  const visitor = await prisma.user.create({
    data: { username: "files_visitor", passwordHash: "x" },
  });
  visitorToken = await signToken({ sub: visitor.id, role: visitor.role });

  await seedCourse({ code: "CS101" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedResource(filePath: string, status: string) {
  await prisma.resource.create({
    data: {
      title: "附件资源",
      type: "LECTURE_NOTE",
      filePath,
      fileName: "note.pdf",
      status: status as never,
      submitterId: adminId,
    },
  });
}

function getReq(name: string, token?: string) {
  return createRequest(`http://localhost/api/files/${name}`, token ? { token } : {});
}

describe("GET /api/files/[name] — 审核门禁", () => {
  it("DRAFT 附件：无 token → 401，普通用户 → 403，管理员 → 门禁通过（404=文件在磁盘不存在）", async () => {
    await seedResource("draft-0000.pdf", "DRAFT");

    const anon = await fileGetHandler(getReq("draft-0000.pdf"), {
      params: Promise.resolve({ name: "draft-0000.pdf" }),
    });
    expect(anon.status).toBe(401);

    const visitor = await fileGetHandler(getReq("draft-0000.pdf", visitorToken), {
      params: Promise.resolve({ name: "draft-0000.pdf" }),
    });
    expect(visitor.status).toBe(403); // 非管理员被拒

    const admin = await fileGetHandler(getReq("draft-0000.pdf", adminToken), {
      params: Promise.resolve({ name: "draft-0000.pdf" }),
    });
    expect(admin.status).toBe(404); // 管理员通过门禁 → 磁盘无此文件 → 404
  });

  it("APPROVED 附件：无 token 也可访问（公开下载），磁盘无文件时 404", async () => {
    await seedResource("approved-0000.pdf", "APPROVED");

    const res = await fileGetHandler(getReq("approved-0000.pdf"), {
      params: Promise.resolve({ name: "approved-0000.pdf" }),
    });
    expect(res.status).toBe(404); // 门禁通过（公开），文件在磁盘不存在
  });

  it("非法文件名（路径穿越）在查库前被拦截", async () => {
    const res = await fileGetHandler(getReq("..%2F..%2Fetc%2Fpasswd"), {
      params: Promise.resolve({ name: "../../etc/passwd" }),
    });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error.code).toBe("BAD_NAME");
  });
});
