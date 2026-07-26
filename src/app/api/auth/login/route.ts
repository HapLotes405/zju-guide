import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken, signRefreshToken, comparePassword, AuthError } from "@/lib/auth";

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };

    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Username and password are required" } },
        { status: 400 }
      );
    }

    // --- find user
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } },
        { status: 401 }
      );
    }

    // --- verify password
    if (!comparePassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } },
        { status: 401 }
      );
    }

    // --- issue tokens
    const payload = { sub: user.id, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      signToken(payload),
      signRefreshToken(payload),
    ]);

    return NextResponse.json({
      data: { accessToken, refreshToken },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
