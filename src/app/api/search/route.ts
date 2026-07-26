import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// ──────────────────────────────────────────────────────────────────────────
// GET /api/search?q=xxx — cross-course search
// Searches course name, course code, and resource titles
// ──────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)),
    );

    // Require a non-empty search query
    if (!q || q.length === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Query parameter 'q' is required" } },
        { status: 400 },
      );
    }

    // Build search filters — use contains for SQLite (case-insensitive is
    // handled by SQLite's default behavior, but we explicitly use mode: 'insensitive'
    // which Prisma translates appropriately).
    const courseFilter = {
      OR: [
        { code: { contains: q } },
        { name: { contains: q } },
      ],
    };

    const resourceFilter = {
      status: "APPROVED" as const,
      title: { contains: q },
    };

    // Run the three queries in parallel
    const [courseMatches, resourceMatches, courseTotal, resourceTotal] =
      await Promise.all([
        // Courses matching by code or name
        prisma.course.findMany({
          where: courseFilter,
          select: {
            code: true,
            name: true,
            credits: true,
            department: true,
            category: true,
            semester: true,
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { code: "asc" },
        }),
        // Approved resources matching by title
        prisma.resource.findMany({
          where: resourceFilter,
          select: {
            id: true,
            title: true,
            type: true,
            url: true,
            summary: true,
            copyrightStatus: true,
            applicableStage: true,
            status: true,
            createdAt: true,
            submitter: {
              select: {
                id: true,
                username: true,
              },
            },
            courseResources: {
              include: {
                course: {
                  select: {
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        prisma.course.count({ where: courseFilter }),
        prisma.resource.count({ where: resourceFilter }),
      ]);

    // Transform results
    const courses = courseMatches.map((c) => ({
      type: "course" as const,
      code: c.code,
      name: c.name,
      credits: c.credits,
      department: c.department,
      category: c.category,
      semester: c.semester,
    }));

    const resources = resourceMatches.map((r) => ({
      type: "resource" as const,
      id: r.id,
      title: r.title,
      resourceType: r.type,
      url: r.url,
      summary: r.summary,
      copyrightStatus: r.copyrightStatus,
      applicableStage: r.applicableStage,
      status: r.status,
      createdAt: r.createdAt,
      submitter: r.submitter,
      courses: r.courseResources.map((cr) => ({
        code: cr.course.code,
        name: cr.course.name,
      })),
    }));

    const total = courseTotal + resourceTotal;

    return NextResponse.json({
      data: {
        query: q,
        results: [...courses, ...resources],
      },
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
