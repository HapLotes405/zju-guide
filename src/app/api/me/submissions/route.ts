import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) {
      throw new AuthError("VALIDATION_ERROR", "页码无效", 400);
    }
    const where = { submitterId: userId };
    const [items, total] = await Promise.all([
      prisma.resource.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
        select: {
          id: true, title: true, type: true, status: true, createdAt: true,
          courseResources: { select: { course: { select: { code: true, name: true } } } },
        },
      }),
      prisma.resource.count({ where }),
    ]);
    return NextResponse.json({ data: { items, total, page, pageSize: 20 } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("GET /api/me/submissions error:", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "投稿记录加载失败" } }, { status: 500 });
  }
}
