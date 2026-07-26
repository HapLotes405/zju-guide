// GET /api/me/path/overdue?semester=N
// 返回逾期未修课程警告列表

import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { calculateAllPaths } from "@/lib/path-engine";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const semesterStr = searchParams.get("semester");
    const currentSemester = semesterStr ? parseInt(semesterStr, 10) : null;

    if (currentSemester === null || isNaN(currentSemester) || currentSemester < 1) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PARAMETER",
            message: "Query parameter 'semester' is required and must be a positive integer (e.g. ?semester=5).",
          },
        },
        { status: 400 },
      );
    }

    const { overdue } = await calculateAllPaths({ userId, currentSemester });

    return NextResponse.json({ data: overdue });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("GET /api/me/path/overdue error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
