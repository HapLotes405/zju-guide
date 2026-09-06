import { NextResponse, type NextRequest } from "next/server";
import { open, type FileHandle } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { uploadPath, UploadError } from "@/lib/upload";
import { requireRole, AuthError } from "@/lib/auth";
import { FilePreviewError, inspectFilePreview } from "@/lib/file-preview";
import { createFileStream, parseFileRange } from "@/lib/file-range";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
};

function errorResponse(
  method: string,
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  const body = JSON.stringify({ error: { code, message } });
  return new NextResponse(method === "HEAD" ? null : body, {
    status,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body)),
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

// GET /api/files/[name] — 下载投稿附件；?preview=1 为受控类型预览
// name 为存储名（uuid.ext），反查资源记录取得原始文件名与类型
// 门禁规则：
//   - 已审核通过（APPROVED）→ 公开下载（课程页/资料页/审核已通过项使用）
//   - 未通过（DRAFT/REJECTED 等）→ 仅管理员可下载（审核盲审预览用）
async function serveFile(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  let file: FileHandle | undefined;
  let body: ReadableStream<Uint8Array> | undefined;
  try {
    const { name } = await params;

    // 先校验存储名格式（uuid.ext），非法输入 / 路径穿越 / NUL 字节在进入数据库前拦截
    let fullPath: string;
    try {
      fullPath = uploadPath(name);
    } catch (e) {
      if (e instanceof UploadError) {
        return errorResponse(request.method, 400, "BAD_NAME", "非法的文件标识");
      }
      throw e;
    }

    const resource = await prisma.resource.findFirst({
      where: { filePath: name },
      select: { fileName: true, mimeType: true, status: true },
    });
    if (!resource) {
      return errorResponse(request.method, 404, "NOT_FOUND", "文件不存在");
    }

    // 未审核通过的附件属于审核工作流内部材料：仅管理员可查看，防提前泄露
    if (resource.status !== "APPROVED") {
      await requireRole(request, "ADMIN"); // 非管理员抛 AuthError → 下方 403
    }

    // Open only after checking this request's current resource status and role.
    // fstat, preview screening and streaming all use this one descriptor.
    request.signal.throwIfAborted();
    file = await open(fullPath, "r");
    request.signal.throwIfAborted();
    const fileStat = await file.stat();
    request.signal.throwIfAborted();
    if (!fileStat.isFile()) {
      return errorResponse(request.method, 404, "NOT_FOUND", "文件不存在");
    }
    if (!Number.isSafeInteger(fileStat.size) || fileStat.size < 0)
      throw new Error("文件大小超出安全读取范围");

    const preview =
      request.nextUrl.searchParams.get("preview") === "1"
        ? await inspectFilePreview(file, name, fileStat.size, request.signal)
        : undefined;
    const encodedName = encodeURIComponent(resource.fileName ?? name).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const headers = new Headers({
      ...PRIVATE_HEADERS,
      "Content-Type": preview?.mimeType ?? resource.mimeType ?? "application/octet-stream",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(fileStat.size),
      "Accept-Ranges": "bytes",
    });
    if (preview?.width && preview.height) {
      headers.set("X-Preview-Width", String(preview.width));
      headers.set("X-Preview-Height", String(preview.height));
    }

    // Range is defined for GET. HEAD returns the full GET headers without a body.
    if (request.method === "HEAD") return new NextResponse(null, { headers });
    // No ETag/Last-Modified validator is exposed: an If-Range condition cannot
    // be satisfied, so send the complete representation rather than stale pieces.
    const range = parseFileRange(
      request.headers.has("If-Range") ? null : request.headers.get("Range"),
      fileStat.size,
    );
    if (range.kind === "unsatisfiable") {
      return errorResponse(request.method, 416, "RANGE_NOT_SATISFIABLE", "请求的文件范围无法满足", {
        "Content-Range": `bytes */${fileStat.size}`,
        "Accept-Ranges": "bytes",
      });
    }
    const start = range.kind === "partial" ? range.start : 0;
    const length = range.kind === "partial" ? range.end - start + 1 : fileStat.size;
    if (range.kind === "partial") {
      headers.set("Content-Range", `bytes ${start}-${range.end}/${fileStat.size}`);
      headers.set("Content-Length", String(length));
    }
    if (length === 0) return new NextResponse(null, { headers });

    body = createFileStream(file, start, length, request.signal);
    const response = new NextResponse(body, {
      status: range.kind === "partial" ? 206 : 200,
      headers,
    });
    file = undefined; // Ownership moves to the response only after construction succeeds.
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(request.method, error.status, error.code, error.message);
    }
    if (request.signal.aborted) {
      return errorResponse(request.method, 499, "REQUEST_ABORTED", "请求已取消");
    }
    if (error instanceof FilePreviewError) {
      return errorResponse(request.method, error.status, error.code, error.message);
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return errorResponse(request.method, 404, "NOT_FOUND", "文件不存在");
    }
    console.error(`${request.method} /api/files/[name] error:`, error);
    return errorResponse(request.method, 500, "INTERNAL_ERROR", "服务器内部错误");
  } finally {
    // Covers HEAD, validation/range errors and response-construction failures.
    if (file) {
      if (body) await body.cancel();
      else await file.close();
    }
  }
}

export const GET = serveFile;
export const HEAD = serveFile;
