import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthError } from "@/lib/auth";
import { sanitizeCourseName, isRealName } from "@/lib/course-name";
import { z } from "zod";

// 培养方案 JSON 格式 — 发给队友郑轶的规范
const ProgramCourseSchema = z.object({
  code: z.string().trim().min(1, "课号不能为空"),
  name: z.string().trim().min(1, "课程名不能为空"),
  credits: z.number().min(0).max(20),
  suggestedSemester: z.number().int().min(1).max(12),
  isCompulsory: z.boolean(),
  groupIndex: z.number().int().min(0).optional(),
});

const RequirementGroupSchema = z.object({
  name: z.string().min(1),
  requiredCredits: z.number().min(0),
  category: z.enum(["gen_ed", "major_base", "major_core", "major_module", "personalized"]),
});

const ProgramImportSchema = z
  .object({
    majorName: z.string().trim().min(1),
    year: z.number().int().min(2018).max(2030),
    totalCredits: z.number().min(0).max(300),
    requirementGroups: z.array(RequirementGroupSchema).min(1),
    courses: z.array(ProgramCourseSchema).min(1),
  })
  .superRefine((data, ctx) => {
    // groupIndex 越界会静默把课程挂到 null 要求组，这里显式报错
    for (let i = 0; i < data.courses.length; i++) {
      const gi = data.courses[i]!.groupIndex;
      if (gi !== undefined && gi >= data.requirementGroups.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["courses", i, "groupIndex"],
          message: `groupIndex ${gi} 越界，要求组共 ${data.requirementGroups.length} 个`,
        });
      }
    }
  });

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, "ADMIN");

    const body = await request.json();

    // 支持单条或批量
    const programs = Array.isArray(body) ? body : [body];

    const results: { majorName: string; year: number; coursesImported: number; status: string }[] = [];

    for (const raw of programs) {
      const parsed = ProgramImportSchema.parse(raw);

      const result = await prisma.$transaction(async (tx) => {
        // 1. 创建培养方案版本
        const program = await tx.programVersion.upsert({
          where: { majorName_year: { majorName: parsed.majorName, year: parsed.year } },
          create: { majorName: parsed.majorName, year: parsed.year, totalCredits: parsed.totalCredits },
          update: { totalCredits: parsed.totalCredits },
        });

        // 2. 创建要求组
        const groups: Record<number, string> = {};
        for (let i = 0; i < parsed.requirementGroups.length; i++) {
          const g = parsed.requirementGroups[i]!;
          const group = await tx.requirementGroup.upsert({
            where: {
              programVersionId_name: {
                programVersionId: program.id,
                name: g.name,
              },
            },
            create: {
              programVersionId: program.id,
              name: g.name,
              requiredCredits: g.requiredCredits,
              category: g.category,
            },
            update: { requiredCredits: g.requiredCredits, category: g.category },
          });
          groups[i] = group.id;
        }

        // 3. 导入课程
        let imported = 0;
        for (const c of parsed.courses) {
          // 清洗入参课程名（移除 *△ 等批注符号；空白名给占位符）
          const cleanName = sanitizeCourseName(c.name, c.code);
          // 确保课程主数据存在：仅当现有名不是「真实名」（空名或占位符）时才写入新名，
          // 避免培养方案数据里的空名/*△名覆盖课程库的干净名称（历史脏数据根因），
          // 同时允许占位符课程被真实名升级。
          const existing = await tx.course.findUnique({
            where: { code: c.code },
            select: { name: true },
          });
          if (existing && isRealName(existing.name)) {
            await tx.course.update({
              where: { code: c.code },
              data: { credits: c.credits },
            });
          } else {
            await tx.course.upsert({
              where: { code: c.code },
              create: { code: c.code, name: cleanName, credits: c.credits },
              update: { name: cleanName, credits: c.credits },
            });
          }

          // 关联到培养方案
          const groupId = c.groupIndex !== undefined ? groups[c.groupIndex] : null;

          await tx.programCourse.upsert({
            where: {
              programVersionId_courseCode: {
                programVersionId: program.id,
                courseCode: c.code,
              },
            },
            create: {
              programVersionId: program.id,
              courseCode: c.code,
              suggestedSemester: c.suggestedSemester,
              isCompulsory: c.isCompulsory,
              requirementGroupId: groupId,
            },
            update: {
              suggestedSemester: c.suggestedSemester,
              isCompulsory: c.isCompulsory,
              requirementGroupId: groupId,
            },
          });
          imported++;
        }

        return { majorName: parsed.majorName, year: parsed.year, coursesImported: imported, status: "ok" };
      });

      results.push(result);
    }

    return NextResponse.json({ data: results }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "JSON格式错误", details: e.errors } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}
