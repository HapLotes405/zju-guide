import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken, signRefreshToken, comparePassword, AuthError } from "@/lib/auth";
import { getClientIp, isRateLimited, hitRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// 登录防爆破：仅对"失败"尝试按 IP 限流（成功登录不计入），避免 NAT 后多人同时登录被误伤。
const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAIL_LIMIT_PER_IP = 10;

// POST /api/auth/login
export async function POST(request: NextRequest) {
  try {
    // 0. 防爆破：入口只读检查（已超限则直接拒绝，不重复计数）
    const ip = getClientIp(request);
    const pre = isRateLimited(`login-fail:${ip}`, {
      limit: LOGIN_FAIL_LIMIT_PER_IP,
      windowMs: LOGIN_FAIL_WINDOW_MS,
    });
    if (!pre.ok) {
      return rateLimitResponse(pre.retryAfterSec);
    }

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

    // 失败才计数；本次失败也计入后若已超阈值，直接返回 429（比多放一次 401 语义更清晰）
    const countFailure = () =>
      hitRateLimit(`login-fail:${ip}`, {
        limit: LOGIN_FAIL_LIMIT_PER_IP,
        windowMs: LOGIN_FAIL_WINDOW_MS,
      });

    if (!user) {
      const rl = countFailure();
      if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid username or password" } },
        { status: 401 }
      );
    }

    // --- verify password
    if (!comparePassword(password, user.passwordHash)) {
      const rl = countFailure();
      if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
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
