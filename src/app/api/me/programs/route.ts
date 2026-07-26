import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { z } from "zod";

const SelectProgramSchema = z.object({
  majorName: z.string().min(1),
  year: z.number().int().min(2018).max(2030),
  type: z.enum(["MAJOR", "MINOR"]).default("MAJOR"),
});

function handleError(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  if (e instanceof z.ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "输入格式错误", details: e.errors } }, { status: 400 });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } }, { status: 500 });
}

// GET — 查看当前用户的培养方案
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const programs = await prisma.userProgram.findMany({
      where: { userId }, include: { programVersion: true }, orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: programs });
  } catch (e) { return handleError(e); }
}

// POST — 学生选择/切换培养方案
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const parsed = SelectProgramSchema.parse(body);

    const program = await prisma.programVersion.findUnique({
      where: { majorName_year: { majorName: parsed.majorName, year: parsed.year } },
    });

    if (!program) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: `未找到 ${parsed.year}级 ${parsed.majorName} 的培养方案` } }, { status: 404 });
    }

    const userProgram = await prisma.userProgram.upsert({
      where: { userId_programVersionId_type: { userId, programVersionId: program.id, type: parsed.type } },
      create: { userId, programVersionId: program.id, type: parsed.type, isConfirmed: true },
      update: { isConfirmed: true },
    });

    return NextResponse.json({ data: userProgram }, { status: 201 });
  } catch (e) { return handleError(e); }
}
