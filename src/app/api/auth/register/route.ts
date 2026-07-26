import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, AuthError } from "@/lib/auth";

// POST /api/auth/register
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };

    // --- validation
    const { username, password } = body;

    if (!username || typeof username !== "string" || username.trim().length < 2) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Username must be at least 2 characters" } },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Password must be at least 6 characters" } },
        { status: 400 }
      );
    }

    const trimmedUsername = username.trim();

    // --- uniqueness check
    const existing = await prisma.user.findUnique({
      where: { username: trimmedUsername },
    });

    if (existing) {
      return NextResponse.json(
        { error: { code: "USERNAME_TAKEN", message: "Username is already taken" } },
        { status: 409 }
      );
    }

    // --- create user
    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        passwordHash: hashPassword(password),
      },
      select: { id: true },
    });

    return NextResponse.json({ data: { userId: user.id } }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("POST /api/auth/register error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
