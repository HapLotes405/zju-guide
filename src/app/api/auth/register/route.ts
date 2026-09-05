import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, AuthError } from "@/lib/auth";
import { getClientIp, hitRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 注册防刷：同一 IP 每小时内最多注册 40 个账号。
// 40 为兼顾"NAT 后全班同时注册"的宽松值；脚本刷号会被限速，且真正耗资源的投稿另有每 IP 投稿限流兜底。
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_LIMIT_PER_IP = 40;

// POST /api/auth/register
export async function POST(request: NextRequest) {
  try {
    // 0. 防刷：按 IP 限流（计数每次注册尝试，含校验失败的）
    const rl = hitRateLimit(`register:${getClientIp(request)}`, {
      limit: REGISTER_LIMIT_PER_IP,
      windowMs: REGISTER_WINDOW_MS,
    });
    if (!rl.ok) {
      return rateLimitResponse(rl.retryAfterSec);
    }

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

    if (/\p{Script=Han}/u.test(password)) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "密码不能包含汉字" } }, { status: 400 });
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
