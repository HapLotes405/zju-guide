import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

// ──────────────────────────────────────────────────────────────────────────
// 期末复习共建内容：复习路线（步骤列表）+ 重点章节（三列表格）
// GET 公开读取；PUT 登录用户可编辑（wiki 式共建），记录最后编辑人
// ──────────────────────────────────────────────────────────────────────────

const chapterSchema = z.object({
  chapter: z.string().trim().min(1).max(50),
  weight: z.string().trim().min(1).max(30),
  note: z.string().trim().max(200).optional().default(""),
});

const putBodySchema = z.object({
  route: z.array(z.string().trim().min(1).max(200)).max(20),
  chapters: z.array(chapterSchema).max(50),
});

interface Chapter {
  chapter: string;
  weight: string;
  note: string;
}

// GET /api/courses/[code]/exam-prep — 读取复习共建内容（无内容时 data 为 null）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    const prep = await prisma.courseExamPrep.findUnique({
      where: { courseCode: code },
      include: { updatedBy: { select: { username: true } } },
    });

    if (!prep) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        route: prep.route as unknown as string[],
        chapters: prep.chapters as unknown as Chapter[],
        updatedByName: prep.updatedBy?.username ?? null,
        updatedAt: prep.updatedAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}

// PUT /api/courses/[code]/exam-prep — 编辑复习共建内容（需登录）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { userId } = await requireAuth(request);
    const { code } = await params;

    const course = await prisma.course.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!course) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `课程「${code}」不存在` } },
        { status: 404 },
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "请求体不是有效的 JSON" } },
        { status: 400 },
      );
    }

    const parsed = putBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "内容格式不正确：复习路线最多 20 步，重点章节需包含章节名和分值占比",
          },
        },
        { status: 400 },
      );
    }

    const { route, chapters } = parsed.data;

    const prep = await prisma.courseExamPrep.upsert({
      where: { courseCode: code },
      create: { courseCode: code, route, chapters, updatedById: userId },
      update: { route, chapters, updatedById: userId },
      include: { updatedBy: { select: { username: true } } },
    });

    return NextResponse.json({
      data: {
        route: prep.route as unknown as string[],
        chapters: prep.chapters as unknown as Chapter[],
        updatedByName: prep.updatedBy?.username ?? null,
        updatedAt: prep.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("PUT /api/courses/[code]/exam-prep error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}
