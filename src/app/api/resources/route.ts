import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import type { ResourceType, CopyrightStatus } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

const VALID_RESOURCE_TYPES: ResourceType[] = [
  "EBOOK",
  "LECTURE_NOTE",
  "EXAM_RECALL",
  "BLOG",
  "CC98_POST",
  "TOOL_TEMPLATE",
  "OTHER",
];

const VALID_COPYRIGHT_STATUSES: CopyrightStatus[] = [
  "PUBLIC_DOMAIN",
  "AUTHORIZED",
  "EXTERNAL_LINK",
  "UNKNOWN",
];

const VALID_APPLICABLE_STAGES = ["BEFORE", "DURING", "FINAL", "ALL"];

interface CreateResourceBody {
  title?: string;
  type?: string;
  url?: string;
  summary?: string;
  copyrightStatus?: string;
  applicableStage?: string;
  courseCodes?: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/resources — submit a new resource (requireAuth, contributor+)
// ──────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate and check role (contributor or admin)
    const { userId, role } = await requireAuth(request);

    if (role !== "CONTRIBUTOR" && role !== "ADMIN") {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Contributor or Admin role is required to submit resources",
          },
        },
        { status: 403 },
      );
    }

    // 2. Parse and validate the request body
    let body: CreateResourceBody;
    try {
      body = (await request.json()) as CreateResourceBody;
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } },
        { status: 400 },
      );
    }

    const { title, type, url, summary, copyrightStatus, applicableStage, courseCodes } = body;

    // Validate title
    if (!title || typeof title !== "string" || title.trim().length < 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Title is required" } },
        { status: 400 },
      );
    }

    // Validate type
    if (!type || !VALID_RESOURCE_TYPES.includes(type as ResourceType)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Type must be one of: ${VALID_RESOURCE_TYPES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    // Validate copyrightStatus if provided
    if (
      copyrightStatus &&
      !VALID_COPYRIGHT_STATUSES.includes(copyrightStatus as CopyrightStatus)
    ) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `copyrightStatus must be one of: ${VALID_COPYRIGHT_STATUSES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    // Validate applicableStage if provided
    if (
      applicableStage &&
      !VALID_APPLICABLE_STAGES.includes(applicableStage)
    ) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `applicableStage must be one of: ${VALID_APPLICABLE_STAGES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    // Validate url (must be a non-empty string if provided)
    if (url !== undefined && url !== null && (typeof url !== "string" || url.trim().length === 0)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "url must be a non-empty string if provided" } },
        { status: 400 },
      );
    }

    // Validate courseCodes
    if (!Array.isArray(courseCodes) || courseCodes.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "courseCodes must be a non-empty array of course codes",
          },
        },
        { status: 400 },
      );
    }

    if (!courseCodes.every((c) => typeof c === "string" && c.trim().length > 0)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Each entry in courseCodes must be a non-empty string",
          },
        },
        { status: 400 },
      );
    }

    // 3. Verify that all course codes exist
    const existingCourses = await prisma.course.findMany({
      where: { code: { in: courseCodes } },
      select: { code: true },
    });

    const existingCodes = new Set(existingCourses.map((c) => c.code));
    const missingCodes = courseCodes.filter((c) => !existingCodes.has(c));

    if (missingCodes.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "COURSES_NOT_FOUND",
            message: `The following course codes do not exist: ${missingCodes.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    // 4. Create the Resource, CourseResource associations, and Submission in a transaction
    const trimmedTitle = title.trim();
    const trimmedUrl = url?.trim() || null;
    const trimmedSummary = summary?.trim() || null;
    const finalCopyrightStatus = (copyrightStatus as CopyrightStatus) || "UNKNOWN";
    const finalApplicableStage = applicableStage || null;

    const result = await prisma.$transaction(async (tx) => {
      // 4a. Create the Resource with DRAFT status
      const resource = await tx.resource.create({
        data: {
          title: trimmedTitle,
          type: type as ResourceType,
          url: trimmedUrl,
          summary: trimmedSummary,
          copyrightStatus: finalCopyrightStatus,
          applicableStage: finalApplicableStage,
          status: "DRAFT",
          submitterId: userId,
        },
      });

      // 4b. Create CourseResource associations
      await tx.courseResource.createMany({
        data: courseCodes.map((courseCode) => ({
          resourceId: resource.id,
          courseCode,
        })),
      });

      // 4c. Create a Submission (result is null = PENDING)
      const submission = await tx.submission.create({
        data: {
          resourceId: resource.id,
          submitterId: userId,
          submittedAt: new Date(),
        },
      });

      return { resource, submission };
    });

    return NextResponse.json(
      {
        data: {
          resourceId: result.resource.id,
          submissionId: result.submission.id,
          title: result.resource.title,
          type: result.resource.type,
          status: result.resource.status,
          courseCodes,
          submittedAt: result.submission.submittedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("POST /api/resources error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
