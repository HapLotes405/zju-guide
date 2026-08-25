import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { uploadPath, UploadError } from "@/lib/upload";
import { requireRole, AuthError } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/files/[name] — 下载投稿附件
// name 为存储名（uuid.ext），反查资源记录取得原始文件名与类型
// 门禁规则：
//   - 已审核通过（APPROVED）→ 公开下载（课程页/资料页/审核已通过项使用）
//   - 未通过（DRAFT/REJECTED 等）→ 仅管理员可下载（审核盲审预览用）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;

    // 先校验存储名格式（uuid.ext），非法输入 / 路径穿越 / NUL 字节在进入数据库前拦截
    let fullPath: string;
    try {
      fullPath = uploadPath(name);
    } catch (e) {
      if (e instanceof UploadError) {
        return NextResponse.json(
          { error: { code: "BAD_NAME", message: "非法的文件标识" } },
          { status: 400 },
        );
      }
      throw e;
    }

    const resource = await prisma.resource.findFirst({
      where: { filePath: name },
      select: { fileName: true, mimeType: true, status: true },
    });
    if (!resource) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "文件不存在" } },
        { status: 404 },
      );
    }

    // 未审核通过的附件属于审核工作流内部材料：仅管理员可查看，防提前泄露
    if (resource.status !== "APPROVED") {
      await requireRole(request, "ADMIN"); // 非管理员抛 AuthError → 下方 403
    }

    const fileStat = await stat(fullPath).catch(() => null);
    if (!fileStat) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "文件不存在" } },
        { status: 404 },
      );
    }

    const buffer = await readFile(fullPath);
    const encodedName = encodeURIComponent(resource.fileName ?? name);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": resource.mimeType ?? "application/octet-stream",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("GET /api/files/[name] error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}
