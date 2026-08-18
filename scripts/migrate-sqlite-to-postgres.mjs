/**
 * 一次性迁移脚本：SQLite prisma/dev.db → postgres msewiki
 * 读取 node:sqlite（只读），写入 @prisma/client（postgres）
 * 用法: node scripts/migrate-sqlite-to-postgres.mjs
 * 前置: postgres msewiki 已备份；本脚本会清空目标表再全量插入
 */
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const SQLITE_PATH = process.env.SQLITE_PATH || "prisma/dev.db";
const BATCH = 1000;

const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
const prisma = new PrismaClient();

// ── 工具 ─────────────────────────────────────────────
// SQLite 毫秒时间戳 → Date；容错字符串/数字/null
const toDate = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) return new Date(n);
  return new Date(v); // ISO 字符串兜底
};
const toBool = (v) => v === 1 || v === true || v === "true" || v === "1";
const all = (sql) => sqlite.prepare(sql).all();
const chunks = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
const log = (msg) => console.log(`[migrate] ${msg}`);

// ── 1. 读取 SQLite ───────────────────────────────────
const usersSql = all('SELECT * FROM "User"');
const programsSql = all('SELECT * FROM "ProgramVersion"');
const coursesSql = all('SELECT * FROM "Course"');
const reqGroupsSql = all('SELECT * FROM "RequirementGroup"');
const teachersSql = all('SELECT * FROM "Teacher"');
const prereqSql = all('SELECT * FROM "CoursePrerequisite"');
const teacherCoursesSql = all('SELECT * FROM "TeacherCourse"');
const reviewsSql = all('SELECT * FROM "TeacherReview"');
const programCoursesSql = all('SELECT * FROM "ProgramCourse"');
const userProgramsSql = all('SELECT * FROM "UserProgram"');
const resourcesSql = all('SELECT * FROM "Resource"');
const courseResourcesSql = all('SELECT * FROM "CourseResource"');
const submissionsSql = all('SELECT * FROM "Submission"');
const auditLogsSql = all('SELECT * FROM "AuditLog"');
log(`SQLite 读取完成: 用户=${usersSql.length} 方案=${programsSql.length} 课程=${coursesSql.length} 组=${reqGroupsSql.length} 老师=${teachersSql.length} 前置=${prereqSql.length} 师课=${teacherCoursesSql.length} 评价=${reviewsSql.length} 方案课=${programCoursesSql.length}`);

// 完整性预检：外键引用的 code 是否都在 Course 表
const courseCodes = new Set(coursesSql.map((c) => c.code));
const missingInPc = [...new Set(programCoursesSql.map((p) => p.courseCode))].filter((c) => !courseCodes.has(c));
const missingInTc = [...new Set(teacherCoursesSql.map((t) => t.courseCode))].filter((c) => !courseCodes.has(c));
if (missingInPc.length || missingInTc.length) {
  log(`⚠️ 外键预检发现缺失课程: ProgramCourse=${JSON.stringify(missingInPc.slice(0, 5))} TeacherCourse=${JSON.stringify(missingInTc.slice(0, 5))}`);
}

// ── 2. 空库守卫 ───────────────────────────────────────
// 本脚本会清空目标表再全量重灌。若 postgres 已有数据（迁移后写入的新数据、
// 用户操作等），重跑会销毁它们。仅在空库执行；强制重灌需显式设 FORCE_MIGRATE=1。
const existingPrograms = await prisma.programVersion.count();
if (existingPrograms > 0 && process.env.FORCE_MIGRATE !== "1") {
  console.error(
    `⚠️  目标库已有 ${existingPrograms} 条 ProgramVersion，中止执行。`,
  );
  console.error(
    "  这是只应在空库上运行的一次性迁移；强制清库重灌请设 FORCE_MIGRATE=1。",
  );
  process.exit(1);
}

// ── 3. 清空目标表（User 保留，其余按依赖顺序）─────────
log("清空 postgres 目标表...");
await prisma.$transaction([
  prisma.review.deleteMany(),
  prisma.submission.deleteMany(),
  prisma.courseResource.deleteMany(),
  prisma.resource.deleteMany(),
  prisma.auditLog.deleteMany(),
  prisma.userProgram.deleteMany(),
  prisma.courseRecord.deleteMany(),
  prisma.sourceImport.deleteMany(),
  prisma.programCourse.deleteMany(),
  prisma.coursePrerequisite.deleteMany(),
  prisma.requirementGroup.deleteMany(),
  prisma.courseExamPrep.deleteMany(),
  prisma.teacherCourse.deleteMany(),
  prisma.teacherReview.deleteMany(),
  prisma.teacher.deleteMany(),
  prisma.course.deleteMany(),
  prisma.programVersion.deleteMany(),
]);
log("清空完成");

// ── 3. User：upsert 保现有密码，SQLite 独有用户补插 ──
log("迁移 User...");
const userMap = {}; // sqliteUserId -> postgresUserId
for (const u of usersSql) {
  const created = await prisma.user.upsert({
    where: { username: u.username },
    update: {}, // 已存在（admin/testuser）→ 不动密码
    create: {
      id: u.id,
      username: u.username,
      passwordHash: u.passwordHash,
      role: u.role,
      createdAt: toDate(u.createdAt) ?? new Date(),
      updatedAt: toDate(u.updatedAt) ?? new Date(),
    },
  });
  userMap[u.id] = created.id;
}
log(`  User: ${usersSql.length} 条处理完成（已存在保留原密码）`);

// ── 4. 主数据：方案 → 课程 → 组 → 老师 → 前置 → 师课 → 评价 → 方案课 ──
log("迁移 ProgramVersion...");
for (const c of chunks(programsSql, BATCH)) {
  await prisma.programVersion.createMany({
    data: c.map((p) => ({
      id: p.id,
      majorName: p.majorName,
      year: p.year,
      totalCredits: p.totalCredits,
      isActive: toBool(p.isActive),
      publishedAt: toDate(p.publishedAt) ?? new Date(),
      createdAt: toDate(p.createdAt) ?? new Date(),
    })),
    skipDuplicates: true,
  });
}
log(`  ProgramVersion: ${programsSql.length}`);

log("迁移 Course...");
for (const c of chunks(coursesSql, BATCH)) {
  await prisma.course.createMany({
    data: c.map((co) => ({
      code: co.code,
      name: co.name,
      credits: co.credits,
      department: co.department ?? null,
      category: co.category ?? null,
      description: co.description ?? null,
      semester: co.semester ?? null,
    })),
    skipDuplicates: true,
  });
}
log(`  Course: ${coursesSql.length}`);

log("迁移 RequirementGroup...");
for (const c of chunks(reqGroupsSql, BATCH)) {
  await prisma.requirementGroup.createMany({
    data: c.map((g) => ({
      id: g.id,
      programVersionId: g.programVersionId,
      name: g.name,
      requiredCredits: g.requiredCredits,
      category: g.category,
    })),
    skipDuplicates: true,
  });
}
log(`  RequirementGroup: ${reqGroupsSql.length}`);

log("迁移 Teacher...");
for (const c of chunks(teachersSql, BATCH)) {
  await prisma.teacher.createMany({
    data: c.map((t) => ({
      id: t.id,
      name: t.name,
      department: t.department ?? null,
      school: t.school ?? "浙江大学",
      score: t.score ?? null,
      ratingCount: t.ratingCount ?? 0,
      rollCallPct: t.rollCallPct ?? null,
      chalaoshiId: t.chalaoshiId ?? null,
      createdAt: toDate(t.createdAt) ?? new Date(),
      updatedAt: toDate(t.updatedAt) ?? new Date(),
    })),
    skipDuplicates: true,
  });
}
log(`  Teacher: ${teachersSql.length}`);

log("迁移 CoursePrerequisite...");
for (const c of chunks(prereqSql, BATCH)) {
  await prisma.coursePrerequisite.createMany({
    data: c.map((p) => ({
      id: p.id,
      courseCode: p.courseCode,
      prerequisiteCode: p.prerequisiteCode,
      relationType: p.relationType ?? "PREREQUISITE",
      reason: p.reason ?? null,
    })),
    skipDuplicates: true,
  });
}
log(`  CoursePrerequisite: ${prereqSql.length}`);

log("迁移 TeacherCourse...");
for (const c of chunks(teacherCoursesSql, BATCH)) {
  await prisma.teacherCourse.createMany({
    data: c.map((t) => ({
      id: t.id,
      teacherId: t.teacherId,
      courseCode: t.courseCode,
      gpa: t.gpa ?? null,
      gpaStd: t.gpaStd ?? null,
      studentCount: t.studentCount ?? null,
    })),
    skipDuplicates: true,
  });
}
log(`  TeacherCourse: ${teacherCoursesSql.length}`);

log("迁移 TeacherReview（大表，分批）...");
for (const c of chunks(reviewsSql, BATCH)) {
  await prisma.teacherReview.createMany({
    data: c.map((r) => ({
      id: r.id,
      teacherId: r.teacherId,
      content: r.content,
      likes: r.likes ?? 0,
      date: r.date ?? null,
      source: r.source ?? "chalaoshi",
    })),
    skipDuplicates: true,
  });
}
log(`  TeacherReview: ${reviewsSql.length}`);

log("迁移 ProgramCourse...");
for (const c of chunks(programCoursesSql, BATCH)) {
  await prisma.programCourse.createMany({
    data: c.map((p) => ({
      id: p.id,
      programVersionId: p.programVersionId,
      courseCode: p.courseCode,
      suggestedSemester: p.suggestedSemester,
      isCompulsory: toBool(p.isCompulsory),
      requirementGroupId: p.requirementGroupId || null,
    })),
    skipDuplicates: true,
  });
}
log(`  ProgramCourse: ${programCoursesSql.length}`);

// ── 5. 小表：UserProgram / Resource / Submission / CourseResource / AuditLog ──
log("迁移 UserProgram...");
for (const c of chunks(userProgramsSql, BATCH)) {
  await prisma.userProgram.createMany({
    data: c.map((u) => ({
      id: u.id,
      userId: userMap[u.userId] || u.userId,
      programVersionId: u.programVersionId,
      type: u.type,
      isConfirmed: toBool(u.isConfirmed),
      createdAt: toDate(u.createdAt) ?? new Date(),
      updatedAt: toDate(u.updatedAt) ?? new Date(),
    })),
    skipDuplicates: true,
  });
}
log(`  UserProgram: ${userProgramsSql.length}`);

log("迁移 Resource...");
for (const c of chunks(resourcesSql, BATCH)) {
  await prisma.resource.createMany({
    data: c.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      url: r.url || null,
      filePath: null, // postgres 新列，SQLite 无
      fileName: null,
      fileSize: null,
      mimeType: null,
      summary: r.summary || null,
      copyrightStatus: r.copyrightStatus || "UNKNOWN",
      applicableStage: r.applicableStage || null,
      status: r.status || "DRAFT",
      submitterId: userMap[r.submitterId] || r.submitterId,
      createdAt: toDate(r.createdAt) ?? new Date(),
      updatedAt: toDate(r.updatedAt) ?? new Date(),
    })),
    skipDuplicates: true,
  });
}
log(`  Resource: ${resourcesSql.length}`);

log("迁移 CourseResource...");
for (const c of chunks(courseResourcesSql, BATCH)) {
  await prisma.courseResource.createMany({
    data: c.map((cr) => ({
      id: cr.id,
      resourceId: cr.resourceId,
      courseCode: cr.courseCode,
    })),
    skipDuplicates: true,
  });
}
log(`  CourseResource: ${courseResourcesSql.length}`);

log("迁移 Submission...");
for (const c of chunks(submissionsSql, BATCH)) {
  await prisma.submission.createMany({
    data: c.map((s) => ({
      id: s.id,
      resourceId: s.resourceId,
      submitterId: userMap[s.submitterId] || s.submitterId,
      submittedAt: toDate(s.submittedAt) ?? new Date(),
      reviewedAt: toDate(s.reviewedAt) ?? null,
      reviewerId: s.reviewerId ? userMap[s.reviewerId] || s.reviewerId : null,
      result: s.result || null,
      reason: s.reason || null,
    })),
    skipDuplicates: true,
  });
}
log(`  Submission: ${submissionsSql.length}`);

log("迁移 AuditLog...");
for (const c of chunks(auditLogsSql, BATCH)) {
  await prisma.auditLog.createMany({
    data: c.map((a) => ({
      id: a.id,
      userId: userMap[a.userId] || a.userId,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      detail: a.detail || null,
      createdAt: toDate(a.createdAt) ?? new Date(),
    })),
    skipDuplicates: true,
  });
}
log(`  AuditLog: ${auditLogsSql.length}`);

// ── 6. 汇总 ─────────────────────────────────────────
const summarize = async (name) => {
  return prisma[name].count();
};
const tables = ["user", "programVersion", "course", "requirementGroup", "teacher", "coursePrerequisite", "teacherCourse", "teacherReview", "programCourse", "userProgram", "resource", "courseResource", "submission", "auditLog"];
const summary = {};
for (const t of tables) summary[t] = await summarize(t);
log("迁移完成！目标库行数:");
console.table(summary);

await prisma.$disconnect();
sqlite.close();
