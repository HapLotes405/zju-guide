import { unlink } from "node:fs/promises";
import type { ResourceType } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MAX_FILE_SIZE,
  saveUpload,
  uploadPath,
  UploadError,
  type SavedUpload,
} from "@/lib/upload";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_RESOURCE_TYPES: ResourceType[] = [
  "EBOOK",
  "LECTURE_NOTE",
  "EXAM_RECALL",
  "BLOG",
  "CC98_POST",
  "TOOL_TEMPLATE",
  "OTHER",
];
const VALID_APPLICABLE_STAGES = ["COURSE", "QUIZ", "MIDTERM", "FINAL"];

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAuth(request);
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) throw new AuthError("NOT_FOUND", "投稿不存在", 404);
    const resource = await prisma.resource.findUnique({
      where: { id }, select: { submitterId: true, filePath: true },
    });
    if (!resource) throw new AuthError("NOT_FOUND", "投稿不存在", 404);
    if (resource.submitterId !== userId) throw new AuthError("FORBIDDEN", "只能删除自己提交的投稿", 403);
    // 课程关联、投稿审核记录由数据库外键级联删除。
    await prisma.resource.delete({ where: { id, submitterId: userId } });
    if (resource.filePath) {
      try { await unlink(uploadPath(resource.filePath)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("清理已删除投稿的附件失败:", error);
      }
    }
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error("DELETE /api/resources/[id] error:", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "删除失败，请稍后重试" } }, { status: 500 });
  }
}

interface UpdateResourceBody {
  title?: string;
  type?: string;
  url?: string;
  summary?: string;
  applicableStage?: string;
}

async function optionalViewerId(request: NextRequest): Promise<string | null> {
  if (!request.headers.get("authorization")) return null;
  try {
    return (await requireAuth(request)).userId;
  } catch {
    return null;
  }
}

// GET /api/resources/[id] — 已审核投稿公开可读，未审核投稿仅投稿者本人可读
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "投稿不存在" } },
        { status: 404 },
      );
    }

    const viewerId = await optionalViewerId(request);
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: {
        submitter: { select: { username: true } },
        courseResources: {
          select: { course: { select: { code: true, name: true } } },
        },
      },
    });

    if (!resource || (resource.status !== "APPROVED" && resource.submitterId !== viewerId)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "投稿不存在或尚未审核" } },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        id: resource.id,
        title: resource.title,
        type: resource.type,
        url: resource.url && /^https?:\/\/\S+$/i.test(resource.url) ? resource.url : null,
        summary: resource.summary,
        filePath: resource.filePath,
        fileName: resource.fileName,
        fileSize: resource.fileSize,
        copyrightStatus: resource.copyrightStatus,
        applicableStage: resource.applicableStage,
        status: resource.status,
        canEdit: resource.submitterId === viewerId,
        submitterName: resource.submitter.username,
        createdAt: resource.createdAt.toISOString(),
        courses: resource.courseResources.map((item) => ({
          code: item.course.code,
          name: item.course.name,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/resources/[id] error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}

// PATCH /api/resources/[id] — 投稿者更新自己的投稿；更新后重新进入审核队列
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let upload: SavedUpload | null = null;
  try {
    const { userId } = await requireAuth(request);
    const { id } = await params;

    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "投稿不存在" } },
        { status: 404 },
      );
    }

    const existing = await prisma.resource.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "投稿不存在" } },
        { status: 404 },
      );
    }
    if (existing.submitterId !== userId) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "只能修改自己提交的投稿" } },
        { status: 403 },
      );
    }

    let body: UpdateResourceBody;
    let pendingFile: File | null = null;
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > MAX_FILE_SIZE + 1024 * 1024) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "文件大小超过 50MB 上限" } },
          { status: 413 },
        );
      }

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return NextResponse.json(
          { error: { code: "INVALID_FORM", message: "表单数据无效" } },
          { status: 400 },
        );
      }

      const value = (key: string): string | undefined => {
        const item = form.get(key);
        return typeof item === "string" ? item : undefined;
      };
      body = {
        title: value("title"),
        type: value("type"),
        url: value("url"),
        summary: value("summary"),
        applicableStage: value("applicableStage"),
      };
      const file = form.get("file");
      if (file instanceof File && file.size > 0) pendingFile = file;
    } else {
      try {
        body = (await request.json()) as UpdateResourceBody;
      } catch {
        return NextResponse.json(
          { error: { code: "INVALID_JSON", message: "请求数据无效" } },
          { status: 400 },
        );
      }
    }

    const title = body.title?.trim();
    if (!title || title.length > 120) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "标题长度应为 1–120 个字符" } },
        { status: 400 },
      );
    }
    if (!body.type || !VALID_RESOURCE_TYPES.includes(body.type as ResourceType)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "资源类型无效" } },
        { status: 400 },
      );
    }
    if (!body.applicableStage || !VALID_APPLICABLE_STAGES.includes(body.applicableStage)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "适用阶段无效" } },
        { status: 400 },
      );
    }

    const url = body.url?.trim() || null;
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "链接必须以 http:// 或 https:// 开头" } },
        { status: 400 },
      );
    }

    if (pendingFile) {
      try {
        upload = await saveUpload(pendingFile);
      } catch (error) {
        return NextResponse.json(
          {
            error: {
              code: "UPLOAD_ERROR",
              message: error instanceof UploadError ? error.message : "文件保存失败",
            },
          },
          { status: 400 },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const resource = await tx.resource.update({
        where: { id },
        data: {
          title,
          type: body.type as ResourceType,
          url,
          summary: body.summary?.trim() || null,
          applicableStage: body.applicableStage,
          status: "DRAFT",
          ...(upload
            ? {
                filePath: upload.filePath,
                fileName: upload.fileName,
                fileSize: upload.fileSize,
                mimeType: upload.mimeType,
              }
            : {}),
        },
      });

      const pending = await tx.submission.findFirst({
        where: { resourceId: id, result: null },
        orderBy: { submittedAt: "desc" },
      });
      const submission = pending
        ? await tx.submission.update({
            where: { id: pending.id },
            data: { submittedAt: new Date() },
          })
        : await tx.submission.create({
            data: { resourceId: id, submitterId: userId },
          });

      return { resource, submission };
    });

    if (upload && existing.filePath && existing.filePath !== upload.filePath) {
      try {
        await unlink(uploadPath(existing.filePath));
      } catch {
        // 旧附件清理失败不影响已经保存的投稿更新
      }
    }

    return NextResponse.json({
      data: {
        resourceId: result.resource.id,
        submissionId: result.submission.id,
        status: result.resource.status,
      },
    });
  } catch (error) {
    if (upload) {
      try {
        await unlink(uploadPath(upload.filePath));
      } catch {
        // 原异常优先返回
      }
    }
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("PATCH /api/resources/[id] error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}
