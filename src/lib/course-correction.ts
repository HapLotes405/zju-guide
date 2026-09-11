import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { correctDocumentCourse, listDocumentCourses } from "@/lib/course-correction-document";
import type { ProgramDocument } from "@/lib/program-document";

export const correctionSchema = z.object({
  mode: z.enum(["program", "search"]),
  programId: z.string().uuid().optional(),
  sourceCode: z.string().trim().min(1).max(100),
  targetCode: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/, "课号只能包含英文字母、数字、下划线或连字符"),
  targetName: z.string().trim().min(1).max(200),
  details: z.object({
    credits: z.number().finite().min(0).max(100),
    department: z.string().trim().max(200),
    category: z.string().trim().max(100),
    description: z.string().trim().max(10000),
    semester: z.string().trim().max(100),
  }).optional(),
  scope: z.enum(["selected", "all"]),
  transfer: z.enum(["independent", "migrate"]),
  action: z.enum(["preview", "apply"]),
  fingerprint: z.string().length(64).optional(),
}).superRefine((input, ctx) => {
  if (input.mode === "program" && !input.programId) ctx.addIssue({ code: "custom", message: "请选择培养方案", path: ["programId"] });
  if (input.action === "apply" && !input.fingerprint) ctx.addIssue({ code: "custom", message: "请先预览修改", path: ["fingerprint"] });
});
export type CorrectionInput = z.infer<typeof correctionSchema>;

async function prepare(tx: Prisma.TransactionClient, input: CorrectionInput) {
  const scope = input.mode === "search" ? "all" : input.scope;
  const source = await tx.course.findUnique({ where: { code: input.sourceCode } });
  const allPrograms = await tx.programVersion.findMany({ include: { programCourses: { where: { courseCode: input.sourceCode } } }, orderBy: { id: "asc" } });
  const references = allPrograms.filter(p => p.programCourses.length || listDocumentCourses(p.programJson as unknown as ProgramDocument | null).some(c => c.courseCode === input.sourceCode));
  if (input.mode === "program" && !references.some(p => p.id === input.programId)) throw new AuthError("CONFLICT", "该课程已不在所选培养方案中，请重新选择", 409);
  if (input.mode === "search" && !source) throw new AuthError("NOT_FOUND", "课程不存在", 404);
  const programs = scope === "all" ? references : references.filter(p => p.id === input.programId);
  const occurrence = programs.flatMap(p => listDocumentCourses(p.programJson as unknown as ProgramDocument | null)).find(c => c.courseCode === input.sourceCode);
  const codeChanged = input.sourceCode !== input.targetCode;
  const details = input.details ? {
    credits: input.details.credits, department: input.details.department || null,
    category: input.details.category || null, description: input.details.description || null, semester: input.details.semester || null,
  } : { credits: source?.credits ?? occurrence?.credits ?? 0, department: source?.department ?? null, category: source?.category ?? null, description: source?.description ?? null, semester: source?.semester ?? null };
  const detailsChanged = !!input.details && Object.entries(details).some(([key, value]) => value !== (source ? source[key as keyof typeof details] : key === "credits" ? occurrence?.credits ?? 0 : null));
  if (!codeChanged && scope === "selected" && detailsChanged) throw new AuthError("VALIDATION_ERROR", "同课号的学分、开课学院等属于课程公共信息，请选择应用到所有培养方案后修改", 400);
  if (codeChanged) {
    const existing = await tx.course.findUnique({ where: { code: input.targetCode } });
    // JSON 中尚未进入课程主表的课号也不能被无意合并。
    if (existing || allPrograms.some(p => listDocumentCourses(p.programJson as unknown as ProgramDocument | null).some(c => c.courseCode === input.targetCode))) {
      throw new AuthError("CONFLICT", "目标课号已存在，请使用未占用的新课号；本功能不会自动合并课程", 409);
    }
  } else {
    const names = programs.flatMap(p => [
      ...p.programCourses.map(c => c.courseNameOverride ?? source?.name),
      ...listDocumentCourses(p.programJson as unknown as ProgramDocument | null).filter(c => c.courseCode === input.sourceCode).map(c => c.courseName),
    ]);
    if (!detailsChanged && (scope !== "all" || source?.name === input.targetName) && names.every(name => name === input.targetName)) throw new AuthError("VALIDATION_ERROR", "课号和课程名称均未改变", 400);
  }
  const [resources, records, teachers, prerequisites, examPrep] = await Promise.all([
    tx.courseResource.findMany({ where: { courseCode: input.sourceCode }, orderBy: { id: "asc" } }),
    tx.courseRecord.findMany({ where: { courseCode: input.sourceCode }, orderBy: { id: "asc" } }),
    tx.teacherCourse.findMany({ where: { courseCode: input.sourceCode }, orderBy: { id: "asc" } }),
    tx.coursePrerequisite.findMany({ where: { OR: [{ courseCode: input.sourceCode }, { prerequisiteCode: input.sourceCode }] }, orderBy: { id: "asc" } }),
    tx.courseExamPrep.findUnique({ where: { courseCode: input.sourceCode } }),
  ]);
  const migrate = codeChanged && input.transfer === "migrate";
  const fingerprint = createHash("sha256").update(JSON.stringify({
    input: { ...input, scope, action: undefined, fingerprint: undefined }, source, references, resources, records, teachers, prerequisites, examPrep,
  })).digest("hex");
  const preview = {
    fingerprint, sourceCode: input.sourceCode, sourceName: source?.name ?? occurrence?.courseName,
    targetCode: input.targetCode, targetName: input.targetName, details, scope, codeChanged, migrate,
    programs: programs.map(p => ({ id: p.id, majorName: p.majorName, year: p.year })),
    unchangedPrograms: references.length - programs.length,
    counts: { resources: resources.length, records: records.length, teachers: teachers.length, prerequisites: prerequisites.length, examPrep: examPrep ? 1 : 0 },
  };
  return { programs, preview, records, teachers, prerequisites, examPrep };
}

export async function correctCourse(input: CorrectionInput, userId: string) {
  return prisma.$transaction(async tx => {
    const { programs, preview, records, teachers, prerequisites, examPrep } = await prepare(tx, input);
    if (input.action === "preview") return preview;
    if (preview.fingerprint !== input.fingerprint) throw new AuthError("CONFLICT", "课程或关联数据已变化，请重新预览后确认", 409);
    if (preview.codeChanged) {
      await tx.course.create({ data: {
        code: input.targetCode, name: input.targetName,
        ...preview.details,
      } });
    } else if (preview.scope === "all") {
      await tx.course.upsert({ where: { code: input.sourceCode }, update: { name: input.targetName, ...preview.details }, create: { code: input.sourceCode, name: input.targetName, ...preview.details } });
    }
    for (const program of programs) {
      await tx.programCourse.updateMany({ where: { programVersionId: program.id, courseCode: input.sourceCode }, data: {
        courseCode: input.targetCode,
        courseNameOverride: !preview.codeChanged && preview.scope === "selected" ? input.targetName : null,
      } });
      if (program.programJson) {
        const document = correctDocumentCourse(program.programJson as unknown as ProgramDocument, input.sourceCode, input.targetCode, input.targetName, input.details?.credits);
        await tx.programVersion.update({ where: { id: program.id }, data: { programJson: document as unknown as Prisma.InputJsonValue } });
      }
    }
    if (preview.migrate) {
      const where = { courseCode: input.sourceCode };
      const data = { courseCode: input.targetCode };
      // 保留所有原始 ID、附件、投稿及审核关联，只迁移课程外键。
      await tx.courseResource.updateMany({ where, data });
      await tx.courseRecord.updateMany({ where, data });
      await tx.teacherCourse.updateMany({ where, data });
      await tx.courseExamPrep.updateMany({ where, data });
      await tx.coursePrerequisite.updateMany({ where, data });
      await tx.coursePrerequisite.updateMany({ where: { prerequisiteCode: input.sourceCode }, data: { prerequisiteCode: input.targetCode } });
    } else if (preview.codeChanged) {
      // 独立课程复制非资源关联，原课程保留原记录；新关联使用新的 ID。
      if (records.length) await tx.courseRecord.createMany({ data: records.map(({ id: _id, ...record }) => ({ ...record, courseCode: input.targetCode })) });
      if (teachers.length) await tx.teacherCourse.createMany({ data: teachers.map(({ id: _id, ...teacher }) => ({ ...teacher, courseCode: input.targetCode })) });
      if (prerequisites.length) await tx.coursePrerequisite.createMany({ data: prerequisites.map(({ id: _id, ...relation }) => ({ ...relation,
        courseCode: relation.courseCode === input.sourceCode ? input.targetCode : relation.courseCode,
        prerequisiteCode: relation.prerequisiteCode === input.sourceCode ? input.targetCode : relation.prerequisiteCode,
      })) });
      if (examPrep) {
        const { id: _id, ...content } = examPrep;
        await tx.courseExamPrep.create({ data: { ...content, courseCode: input.targetCode, chapters: content.chapters as Prisma.InputJsonValue, route: content.route as Prisma.InputJsonValue } });
      }
    }
    await tx.auditLog.create({ data: { userId, action: "COURSE_CORRECTED", targetType: "Course", targetId: input.targetCode, detail: JSON.stringify(preview) } });
    return preview;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
