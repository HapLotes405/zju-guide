import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError, comparePassword, hashPassword } from "@/lib/auth";
import { hitRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const limit = hitRateLimit(`password:${userId}`, { limit: 5, windowMs: 60_000 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    let body;
    try { body = await request.json(); }
    catch { throw new AuthError("VALIDATION_ERROR", "请求格式无效", 400); }
    const { currentPassword, newPassword } = body ?? {};
    if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || newPassword.length < 6 || Buffer.byteLength(newPassword, "utf8") > 72) {
      throw new AuthError("VALIDATION_ERROR", "请填写当前密码，新密码至少 6 个字符且不超过 72 字节", 400);
    }
    if (/\p{Script=Han}/u.test(newPassword)) throw new AuthError("VALIDATION_ERROR", "密码不能包含汉字", 400);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !comparePassword(currentPassword, user.passwordHash)) {
      throw new AuthError("INVALID_PASSWORD", "当前密码不正确", 400);
    }
    if (comparePassword(newPassword, user.passwordHash)) {
      throw new AuthError("VALIDATION_ERROR", "新密码不能与当前密码相同", 400);
    }
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(newPassword) } });
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error("PATCH /api/auth/password error:", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "密码修改失败，请稍后重试" } }, { status: 500 });
  }
}
