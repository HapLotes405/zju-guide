import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// 投稿附件上传：白名单扩展名 + 20MB 上限，存储名为 uuid 防碰撞

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "zip", "txt", "md", "png", "jpg", "jpeg",
]);

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export class UploadError extends Error {}

export interface SavedUpload {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export async function saveUpload(file: File): Promise<SavedUpload> {
  const originalName = file.name || "attachment";
  const ext = originalName.includes(".")
    ? originalName.split(".").pop()!.toLowerCase()
    : "";

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new UploadError(
      `不支持的文件类型 .${ext}，支持：${[...ALLOWED_EXTENSIONS].join(" / ")}`,
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new UploadError("文件大小超过 20MB 上限");
  }

  const filePath = `${randomUUID()}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, filePath), Buffer.from(await file.arrayBuffer()));

  return {
    filePath,
    fileName: originalName,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export function uploadPath(filePath: string): string {
  // filePath 是 uuid.ext 形式，不含目录分隔符；再校验一次防路径穿越
  if (!/^[\w-]+\.\w+$/.test(filePath)) {
    throw new UploadError("非法的文件标识");
  }
  return path.join(UPLOAD_DIR, filePath);
}
