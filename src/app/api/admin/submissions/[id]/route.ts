import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthError } from "@/lib/auth";

// PATCH /api/admin/submissions/[id] — 审核操作（通过/驳回）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
  const { userId } = await requireRole(request, "ADMIN");
  const { id } = await params;
  const body = await request.json();
  const { result, reason } = body as { result: string; reason?: string };

  if (!["APPROVED", "REJECTED", "NEEDS_REVISION", "MERGED"].includes(result)) {
    return NextResponse.json(
      { error: { code: "INVALID_RESULT", message: "无效的审核结果" } },
      { status: 400 },
    );
  }

  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "审核项不存在" } },
      { status: 404 },
    );
  }
  if (submission.result !== null) {
    return NextResponse.json(
      { error: { code: "ALREADY_REVIEWED", message: "该资源已审核过" } },
      { status: 409 },
    );
  }

  // 事务：更新Submission + Resource状态 + 写入audit_log
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.submission.update({
      where: { id },
      data: {
        result: result as "APPROVED" | "REJECTED" | "NEEDS_REVISION" | "MERGED",
        reason: reason ?? null,
        reviewerId: userId,
        reviewedAt: new Date(),
      },
    });

    // 同步Resource状态
    const resourceStatus = result === "APPROVED" ? "APPROVED"
      : result === "REJECTED" ? "REJECTED"
      : "DRAFT";

    await tx.resource.update({
      where: { id: s.resourceId },
      data: { status: resourceStatus as "APPROVED" | "REJECTED" | "DRAFT" },
    });

    // 写入审计日志
    await tx.auditLog.create({
      data: {
        userId,
        action: `RESOURCE_${result}`,
        targetType: "Resource",
        targetId: s.resourceId,
        detail: reason ?? `审核结果: ${result}`,
      },
    });

    return s;
  });

  return NextResponse.json({ data: { id: updated.id, result: updated.result } });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } }, { status: 500 });
  }
}
