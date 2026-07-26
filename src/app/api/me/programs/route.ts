import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { z } from "zod";

const SelectProgramSchema = z.object({
  majorName: z.string().min(1),
  year: z.number().int().min(2018).max(2030),
  type: z.enum(["MAJOR", "MINOR"]).default("MAJOR"),
});

// GET — 查看当前用户的培养方案
export async function GET(request: NextRequest) {
  const { userId } = await requireAuth(request);
  const programs = await prisma.userProgram.findMany({
    where: { userId },
    include: { programVersion: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: programs });
}

// POST — 学生选择/切换培养方案
export async function POST(request: NextRequest) {
  const { userId } = await requireAuth(request);
  const body = await request.json();
  const parsed = SelectProgramSchema.parse(body);

  // 找到对应的培养方案
  const program = await prisma.programVersion.findUnique({
    where: { majorName_year: { majorName: parsed.majorName, year: parsed.year } },
  });

  if (!program) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `未找到 ${parsed.year}级 ${parsed.majorName} 的培养方案` } },
      { status: 404 },
    );
  }

  // upsert：如果已有同专业同年级的Program，更新；否则创建
  const userProgram = await prisma.userProgram.upsert({
    where: {
      userId_programVersionId_type: {
        userId,
        programVersionId: program.id,
        type: parsed.type,
      },
    },
    create: {
      userId,
      programVersionId: program.id,
      type: parsed.type,
      isConfirmed: true,
    },
    update: {
      isConfirmed: true,
    },
  });

  return NextResponse.json({ data: userProgram }, { status: 201 });
}
