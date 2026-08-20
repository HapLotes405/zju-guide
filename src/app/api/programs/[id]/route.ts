import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/programs/[id] — 按 id 取单个培养方案（含整份递归树文档 programJson）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 非法 UUID：Prisma 会对格式错误的 id 抛异常 → 500。这里先拦截成 404。
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "培养方案不存在" } },
        { status: 404 },
      );
    }

    const programVersion = await prisma.programVersion.findUnique({
      where: { id },
      select: {
        id: true,
        majorName: true,
        year: true,
        totalCredits: true,
        isActive: true,
        programJson: true,
      },
    });

    if (!programVersion) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "培养方案不存在" } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        id: programVersion.id,
        majorName: programVersion.majorName,
        year: programVersion.year,
        totalCredits: programVersion.totalCredits,
        isActive: programVersion.isActive,
        document: programVersion.programJson,
      },
    });
  } catch (error) {
    console.error("GET /api/programs/[id] error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}
