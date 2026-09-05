import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { Prisma } from "@prisma/client";

// PATCH /api/auth/me — 只更新当前登录用户，头像随用户数据持久化。
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    if (Number(request.headers.get("content-length")) > 1024 * 1024 + 16384) {
      throw new AuthError("VALIDATION_ERROR", "头像不能超过 1MB", 413);
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AuthError("VALIDATION_ERROR", "表单数据无效", 400);
    }
    const username = form.get("username");
    if (typeof username !== "string" || username.trim().length < 2 || username.trim().length > 50) {
      throw new AuthError("VALIDATION_ERROR", "用户名需为 2–50 个字符", 400);
    }
    let avatar: string | undefined;
    const file = form.get("avatar");
    if (file !== null) {
      if (!(file instanceof File) || file.size === 0 || file.size > 1024 * 1024) {
        throw new AuthError("VALIDATION_ERROR", "请选择不超过 1MB 的 PNG、JPEG 或 WebP 图片", 400);
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          ? "image/jpeg"
          : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
            ? "image/webp" : null;
      if (!mime) throw new AuthError("VALIDATION_ERROR", "头像仅支持 PNG、JPEG 或 WebP 图片", 400);
      avatar = `data:${mime};base64,${bytes.toString("base64")}`;
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { username: username.trim(), ...(avatar ? { avatar } : {}) },
      select: { id: true, username: true, avatar: true, role: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ data: user });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: { code: "USERNAME_TAKEN", message: "该用户名已被使用" } }, { status: 409 });
    }
    console.error("PATCH /api/auth/me error:", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "保存失败，请稍后重试" } }, { status: 500 });
  }
}

// GET /api/auth/me
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatar: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "User not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: user });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("GET /api/auth/me error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
