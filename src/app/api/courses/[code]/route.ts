import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/courses/[code]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    const course = await prisma.course.findUnique({
      where: { code },
      include: {
        // Courses this one depends on (prerequisites)
        prerequisites: {
          include: {
            prerequisite: {
              select: {
                code: true,
                name: true,
                credits: true,
                semester: true,
              },
            },
          },
          orderBy: { prerequisiteCode: "asc" },
        },
        // Courses that depend on this one (dependents)
        dependents: {
          include: {
            course: {
              select: {
                code: true,
                name: true,
                credits: true,
                semester: true,
              },
            },
          },
          orderBy: { courseCode: "asc" },
        },
        // Related program courses (which majors include this course)
        programCourses: {
          include: {
            programVersion: {
              select: {
                majorName: true,
                year: true,
              },
            },
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Course '${code}' not found` } },
        { status: 404 },
      );
    }

    // Transform the response to a cleaner shape
    const result = {
      code: course.code,
      name: course.name,
      credits: course.credits,
      department: course.department,
      category: course.category,
      description: course.description,
      semester: course.semester,
      prerequisites: course.prerequisites.map((p) => ({
        code: p.prerequisite.code,
        name: p.prerequisite.name,
        credits: p.prerequisite.credits,
        semester: p.prerequisite.semester,
        relationType: p.relationType,
        reason: p.reason,
      })),
      dependents: course.dependents.map((d) => ({
        code: d.course.code,
        name: d.course.name,
        credits: d.course.credits,
        semester: d.course.semester,
        relationType: d.relationType,
        reason: d.reason,
      })),
      programs: course.programCourses.map((pc) => ({
        majorName: pc.programVersion.majorName,
        year: pc.programVersion.year,
        suggestedSemester: pc.suggestedSemester,
        isCompulsory: pc.isCompulsory,
      })),
    };

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("GET /api/courses/[code] error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
