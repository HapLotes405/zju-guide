import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { uploadPath, UploadError } from "@/lib/upload";

export const runtime = "nodejs";

// GET /api/files/[name] — 下载投稿附件
// name 为存储名（uuid.ext），反查资源记录取得原始文件名与类型
// 仅允许下载「已审核通过」资源的附件：审核门禁在文件层同样生效
export async function GET(
  _request: NextRequest,
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
      where: { filePath: name, status: "APPROVED" },
      select: { fileName: true, mimeType: true },
    });
    if (!resource) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "文件不存在" } },
        { status: 404 },
      );
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
    console.error("GET /api/files/[name] error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}
