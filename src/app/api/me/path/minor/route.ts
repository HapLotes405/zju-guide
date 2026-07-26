// GET /api/me/path/minor?semester=N
// 返回辅修要求完成度

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
            message: "Query parameter 'semester' is required and must be a positive integer (e.g. ?semester=3).",
          },
        },
        { status: 400 },
      );
    }

    const { minor } = await calculateAllPaths({ userId, currentSemester });

    return NextResponse.json({ data: minor });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("GET /api/me/path/minor error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
