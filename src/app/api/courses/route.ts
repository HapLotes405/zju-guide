import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/courses?search=&major=&semester=&page=&pageSize=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const major = searchParams.get("major");
    const programVersionIds = searchParams.getAll("programVersionId").filter(Boolean);
    // 防放大：单次最多 10 个方案（dashboard 最多 1 主修 + 3 辅修 = 4 个）
    if (programVersionIds.length > 10) {
      return NextResponse.json(
        { error: { code: "INVALID_PARAM", message: "Too many programVersionId parameters (max 10)" } },
        { status: 400 },
      );
    }
    const semester = searchParams.get("semester");
    const search = searchParams.get("search");
    const pageRaw = parseInt(searchParams.get("page") || "1", 10);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10);
    const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.min(2000, Math.max(1, pageSizeRaw))
      : 20;

    // Build the where clause
    const where: Record<string, unknown> = {};

    // Text search: match code (prefix) OR name (contains)
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { code: { startsWith: q } },
        { name: { contains: q } },
      ];
    }

    if (semester) {
      where.semester = semester;
    }

    if (programVersionIds.length > 0) {
      where.programCourses = {
        some: {
          programVersionId: { in: programVersionIds },
        },
      };
    } else if (major) {
      where.programCourses = {
        some: {
          programVersion: {
            majorName: major,
          },
        },
      };
    }

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        select: {
          code: true,
          name: true,
          credits: true,
          department: true,
          category: true,
          semester: true,
          // 仅在按培养方案过滤时返回方案学期信息（时间线板块用）
          ...(programVersionIds.length > 0
            ? {
                programCourses: {
                  where: { programVersionId: { in: programVersionIds } },
                  select: {
                    programVersionId: true,
                    suggestedSemester: true,
                    isCompulsory: true,
                    requirementGroup: {
                      select: { category: true, name: true },
                    },
                  },
                  orderBy: { suggestedSemester: "asc" },
                },
              }
            : {}),
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { code: "asc" },
      }),
      prisma.course.count({ where }),
    ]);

    return NextResponse.json({
      data: courses,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  } catch (error) {
    console.error("GET /api/courses error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
