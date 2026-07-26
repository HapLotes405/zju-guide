import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthError } from "@/lib/auth";

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/review-queue — list pending submissions (requireRole admin)
// ──────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate as admin
    await requireRole(request, "ADMIN");

    // 2. Parse pagination params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)),
    );

    // 3. Build the where clause: submissions with result = null (PENDING)
    const where = { result: null };

    // 4. Fetch submissions with resource and submitter details
    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        include: {
          resource: {
            include: {
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
              submitter: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          submitter: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { submittedAt: "asc" }, // oldest first
      }),
      prisma.submission.count({ where }),
    ]);

    // 5. Transform the response
    const data = submissions.map((s) => ({
      submissionId: s.id,
      submittedAt: s.submittedAt,
      submitter: {
        id: s.submitter.id,
        username: s.submitter.username,
      },
      resource: {
        id: s.resource.id,
        title: s.resource.title,
        type: s.resource.type,
        url: s.resource.url,
        summary: s.resource.summary,
        copyrightStatus: s.resource.copyrightStatus,
        applicableStage: s.resource.applicableStage,
        status: s.resource.status,
        createdAt: s.resource.createdAt,
        courses: s.resource.courseResources.map((cr) => ({
          code: cr.course.code,
          name: cr.course.name,
        })),
      },
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("GET /api/admin/review-queue error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
