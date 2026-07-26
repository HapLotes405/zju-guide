import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { normalize } from "@/lib/json-adapter";
import type { NormalizedDocument } from "@/lib/json-adapter";
import { Prisma } from "@prisma/client";

// ──────────────────────────────────────────────────────────────────────────
// POST /api/me/imports
// ──────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);

    // 1. Parse the incoming JSON body.
    let rawJson: unknown;
    try {
      rawJson = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } },
        { status: 400 },
      );
    }

    // 2. Normalize — this also strips sensitive fields, maps old→new format,
    //    normalizes grades, and validates via Zod.
    let normalized: NormalizedDocument;
    try {
      normalized = normalize(rawJson);
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_SCHEMA",
            message:
              "The JSON payload does not match any supported transcript format. " +
              "Expected either { major, year, courses: [{ code, name, credits, semester, grade }] } " +
              "or the legacy { program, grade, records: [{ courseId, title, credit, term, result }] } format.",
          },
        },
        { status: 422 },
      );
    }

    // 3. Determine the best-guess schema version string for the import record.
    const hasOldShape =
      rawJson !== null &&
      typeof rawJson === "object" &&
      "program" in (rawJson as Record<string, unknown>) &&
      "records" in (rawJson as Record<string, unknown>);
    const schemaVersion = hasOldShape ? "0.5" : "1.0";

    // 4. Persist the raw import record.
    const importRecord = await prisma.sourceImport.create({
      data: {
        userId,
        rawJson: rawJson as Prisma.InputJsonValue,
        schemaVersion,
      },
    });

    // 5. Upsert Course and CourseRecord for every course in the normalized doc.
    let coursesAdded = 0;
    let coursesSkipped = 0;
    const resultCourses: Array<{
      code: string;
      name: string;
      credits: number;
      semester: number;
      grade: string;
      status: "added" | "skipped";
    }> = [];

    for (const c of normalized.courses) {
      // 5a. Ensure the master Course row exists (so the FK on CourseRecord succeeds).
      await prisma.course.upsert({
        where: { code: c.code },
        create: {
          code: c.code,
          name: c.name,
          credits: c.credits,
          semester: null, // This column on Course is a textual description like "大一上"
        },
        update: {
          // Only update name / credits in case they've changed upstream.
          name: c.name,
          credits: c.credits,
        },
      });

      // 5b. Upsert CourseRecord — unique on (userId, courseCode).
      try {
        const existing = await prisma.courseRecord.findUnique({
          where: {
            userId_courseCode: { userId, courseCode: c.code },
          },
        });

        if (existing) {
          // Already exists — update the non-key fields but count as skipped.
          await prisma.courseRecord.update({
            where: { id: existing.id },
            data: {
              status: "PASSED",
              semester: c.semester,
              source: "IMPORT",
            },
          });
          coursesSkipped++;
          resultCourses.push({ ...c, status: "skipped" });
        } else {
          await prisma.courseRecord.create({
            data: {
              userId,
              courseCode: c.code,
              status: "PASSED",
              semester: c.semester,
              source: "IMPORT",
            },
          });
          coursesAdded++;
          resultCourses.push({ ...c, status: "added" });
        }
      } catch (err) {
        // If two parallel requests race on the upsert, the second may hit the
        // unique constraint. Retry once as a find → update path.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          const existingAfterRace = await prisma.courseRecord.findUnique({
            where: {
              userId_courseCode: { userId, courseCode: c.code },
            },
          });
          if (existingAfterRace) {
            await prisma.courseRecord.update({
              where: { id: existingAfterRace.id },
              data: {
                status: "PASSED",
                semester: c.semester,
                source: "IMPORT",
              },
            });
            coursesSkipped++;
            resultCourses.push({ ...c, status: "skipped" });
            continue;
          }
        }
        throw err;
      }
    }

    // 6. Write audit log.
    await prisma.auditLog.create({
      data: {
        userId,
        action: "IMPORT_CONFIRMED",
        targetType: "SourceImport",
        targetId: importRecord.id,
        detail: JSON.stringify({
          major: normalized.major,
          year: normalized.year,
          coursesAdded,
          coursesSkipped,
        }),
      },
    });

    // 7. Return the result.
    return NextResponse.json(
      {
        data: {
          importId: importRecord.id,
          coursesAdded,
          coursesSkipped,
          courses: resultCourses,
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
    console.error("POST /api/me/imports error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/me/imports
// ──────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);

    const imports = await prisma.sourceImport.findMany({
      where: { userId },
      orderBy: { importedAt: "desc" },
      select: {
        id: true,
        schemaVersion: true,
        importedAt: true,
        rawJson: true,
      },
    });

    return NextResponse.json({ data: imports });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("GET /api/me/imports error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
