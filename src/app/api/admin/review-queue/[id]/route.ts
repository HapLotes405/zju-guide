import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, AuthError } from "@/lib/auth";
import type { ReviewResult, ResourceStatus } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

const VALID_RESULTS: ReviewResult[] = ["APPROVED", "REJECTED", "NEEDS_REVISION"];

interface ReviewActionBody {
  result?: string;
  reason?: string;
}

// Maps review result to the corresponding resource status
const RESULT_TO_RESOURCE_STATUS: Record<ReviewResult, ResourceStatus> = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  NEEDS_REVISION: "DRAFT", // Send back to draft so contributor can revise
  MERGED: "APPROVED", // Treated same as approved
};

const RESULT_TO_AUDIT_ACTION: Record<ReviewResult, string> = {
  APPROVED: "RESOURCE_APPROVED",
  REJECTED: "RESOURCE_REJECTED",
  NEEDS_REVISION: "RESOURCE_REJECTED", // Using REJECTED for needs-revision as well
  MERGED: "RESOURCE_APPROVED",
};

// ──────────────────────────────────────────────────────────────────────────
// POST /api/admin/review-queue/[id] — review a submission (requireRole admin)
// ──────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 1. Authenticate as admin
    const { userId: reviewerId } = await requireRole(request, "ADMIN");

    const { id: submissionId } = await params;

    // 2. Parse and validate the request body
    let body: ReviewActionBody;
    try {
      body = (await request.json()) as ReviewActionBody;
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } },
        { status: 400 },
      );
    }

    const { result, reason } = body;

    if (!result || !VALID_RESULTS.includes(result as ReviewResult)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `result must be one of: ${VALID_RESULTS.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    const reviewResult = result as ReviewResult;
    const reviewReason = reason?.trim() || null;

    // 3. Find the submission
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { resource: true },
    });

    if (!submission) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: `Submission '${submissionId}' not found` } },
        { status: 404 },
      );
    }

    // 4. Check that the submission hasn't already been reviewed
    if (submission.result !== null) {
      return NextResponse.json(
        {
          error: {
            code: "ALREADY_REVIEWED",
            message: `This submission has already been reviewed (result: ${submission.result})`,
          },
        },
        { status: 409 },
      );
    }

    // 5. Update Submission, Resource, create Review, and write AuditLog in a transaction
    const newResourceStatus = RESULT_TO_RESOURCE_STATUS[reviewResult];
    const auditAction = RESULT_TO_AUDIT_ACTION[reviewResult];
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      // 5a. Update the submission
      const updatedSubmission = await tx.submission.update({
        where: { id: submissionId },
        data: {
          result: reviewResult,
          reason: reviewReason,
          reviewerId,
          reviewedAt: now,
        },
      });

      // 5b. Update the resource status
      const updatedResource = await tx.resource.update({
        where: { id: submission.resourceId },
        data: { status: newResourceStatus },
      });

      // 5c. Create a Review record
      const review = await tx.review.create({
        data: {
          submissionId,
          reviewerId,
          result: reviewResult,
          reason: reviewReason,
          reviewedAt: now,
        },
      });

      // 5d. Write audit log
      const auditLog = await tx.auditLog.create({
        data: {
          userId: reviewerId,
          action: auditAction,
          targetType: "Resource",
          targetId: submission.resourceId,
          detail: JSON.stringify({
            submissionId,
            result: reviewResult,
            reason: reviewReason,
            previousStatus: submission.resource.status,
            newStatus: newResourceStatus,
          }),
        },
      });

      return { updatedSubmission, updatedResource, review, auditLog };
    });

    return NextResponse.json({
      data: {
        submissionId: updated.updatedSubmission.id,
        resourceId: updated.updatedResource.id,
        result: updated.updatedSubmission.result,
        reason: updated.updatedSubmission.reason,
        reviewedAt: updated.updatedSubmission.reviewedAt,
        reviewerId: updated.updatedSubmission.reviewerId,
        resourceStatus: updated.updatedResource.status,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("POST /api/admin/review-queue/[id] error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
