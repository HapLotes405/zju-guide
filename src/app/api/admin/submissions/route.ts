import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthError } from "@/lib/auth";

// GET /api/admin/submissions — 审核列表（前端期望 {pending, reviewed}）
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, "ADMIN");

  const submissions = await prisma.submission.findMany({
    include: {
      resource: {
        include: { courseResources: { include: { course: true } } },
      },
      submitter: { select: { id: true, username: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const pending = submissions
    .filter((s) => s.result === null)
    .map(formatSubmission);

  const reviewed = submissions
    .filter((s) => s.result !== null)
    .map(formatSubmission);

  return NextResponse.json({ data: { pending, reviewed } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } }, { status: 500 });
  }
}

function formatSubmission(s: {
  id: string;
  resourceId: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  result: string | null;
  reason: string | null;
  resource: {
    id: string;
    title: string;
    type: string;
    url: string | null;
    summary: string | null;
    copyrightStatus: string;
    applicableStage: string | null;
    status: string;
    submitterId: string;
    createdAt: Date;
    filePath: string | null;
    fileName: string | null;
    fileSize: number | null;
    courseResources: { course: { code: string; name: string } }[];
  };
  submitter: { id: string; username: string };
}) {
  return {
    id: s.id,
    resource: {
      id: s.resource.id,
      title: s.resource.title,
      type: s.resource.type,
      url: s.resource.url,
      summary: s.resource.summary,
      copyrightStatus: s.resource.copyrightStatus,
      applicableStage: s.resource.applicableStage,
      status: s.resource.status,
      // 附件元信息（审核页预览/下载用；filePath 为 uuid.ext，前端拼 /api/files/<filePath>）
      filePath: s.resource.filePath,
      fileName: s.resource.fileName,
      fileSize: s.resource.fileSize,
    },
    courses: s.resource.courseResources.map((cr) => ({
      code: cr.course.code,
      name: cr.course.name,
    })),
    submitter: { id: s.submitter.id, username: s.submitter.username },
    submittedAt: s.submittedAt.toISOString(),
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    result: s.result,
    reason: s.reason,
  };
}
