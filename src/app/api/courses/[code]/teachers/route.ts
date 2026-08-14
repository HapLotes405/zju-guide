import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  try {
    const course = await prisma.course.findUnique({
      where: { code }, select: { code: true },
    });
    if (!course) return NextResponse.json({ data: [] });

    const tcs = await prisma.teacherCourse.findMany({
      where: { courseCode: code },
      include: {
        teacher: {
          include: {
            courses: { include: { course: { select: { code: true, name: true } } } },
            reviews: { orderBy: { likes: "desc" }, take: 10 },
          },
        },
      },
    });

    const data = tcs
      .map((tc) => ({
        id: tc.teacher.id,
        name: tc.teacher.name,
        department: tc.teacher.department,
        school: tc.teacher.school,
        score: tc.teacher.score,
        ratingCount: tc.teacher.ratingCount,
        rollCallPct: tc.teacher.rollCallPct,
        chalaoshiId: tc.teacher.chalaoshiId,
        chalaoshiUrl: tc.teacher.chalaoshiId
          ? `https://dahua309.uk/t/${tc.teacher.chalaoshiId}/`
          : null,
        courses: tc.teacher.courses.map((c) => ({
          courseCode: c.course.code,
          courseName: c.course.name,
          gpa: c.gpa,
          gpaStd: c.gpaStd,
          studentCount: c.studentCount,
        })),
        reviews: tc.teacher.reviews.map((r) => ({
          content: r.content,
          likes: r.likes,
          date: r.date,
          source: r.source,
        })),
      }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({
      error: { code: "INTERNAL_ERROR", message: error?.message || String(error) },
    }, { status: 500 });
  }
}
