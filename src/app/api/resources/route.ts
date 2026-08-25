import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import type { ResourceType, CopyrightStatus } from "@prisma/client";
import { saveUpload, uploadPath, UploadError, MAX_FILE_SIZE, type SavedUpload } from "@/lib/upload";
import { getClientIp, hitRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { unlink } from "node:fs/promises";

// 投稿配额（防公开注册后被脚本刷 DRAFT + 附件耗尽磁盘/审核队列）
const MAX_PENDING_PER_USER = 5; // 每用户最多同时 5 条待审核投稿
const SUBMIT_WINDOW_MS = 60 * 60 * 1000; // 每 IP 每小时
const SUBMIT_LIMIT_PER_IP = 20; // 每 IP 每小时最多成功提交 20 条（兼容 NAT 后多人活跃投稿）

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

const VALID_RESOURCE_TYPES: ResourceType[] = [
  "EBOOK",
  "LECTURE_NOTE",
  "EXAM_RECALL",
  "BLOG",
  "CC98_POST",
  "TOOL_TEMPLATE",
  "OTHER",
];

const VALID_COPYRIGHT_STATUSES: CopyrightStatus[] = [
  "PUBLIC_DOMAIN",
  "AUTHORIZED",
  "EXTERNAL_LINK",
  "UNKNOWN",
];

// 学习进度分类：平时学习 / 小测 / 期中 / 期末
const VALID_APPLICABLE_STAGES = ["COURSE", "QUIZ", "MIDTERM", "FINAL"];

interface CreateResourceBody {
  title?: string;
  type?: string;
  url?: string;
  summary?: string;
  copyrightStatus?: string;
  applicableStage?: string;
  courseCodes?: string[];
}

// ──────────────────────────────────────────────────────────────────────────
// GET /api/resources — 浏览全部已审核资源（学习资料页默认内容）
// 返回每个资源关联的课程（供页面渲染课程 chip 跳转）与贡献者信息
// ──────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const resources = await prisma.resource.findMany({
      where: { status: "APPROVED" },
      include: {
        submitter: { select: { username: true } },
        courseResources: {
          select: { course: { select: { code: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      // 兜底上限：当前浏览页依赖完整数组做计数与客户端过滤，
      // 不加 take 时数据量增长会一次拉全表。500 远超现实规模，仅作防滥用护栏。
      take: 500,
    });

    const data = resources.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      // 读侧白名单（纵深防御）：仅透传 http(s) 外链，异常值置空
      // 防未来直接写库路径插入 javascript:/data: 被渲染成可点击链接
      url: r.url && /^https?:\/\/\S+$/i.test(r.url) ? r.url : null,
      summary: r.summary,
      filePath: r.filePath,
      fileName: r.fileName,
      fileSize: r.fileSize,
      copyrightStatus: r.copyrightStatus,
      applicableStage: r.applicableStage,
      submitterName: r.submitter.username,
      createdAt: r.createdAt.toISOString(),
      courses: r.courseResources.map((cr) => ({
        code: cr.course.code,
        name: cr.course.name,
      })),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    // 对齐同文件 POST 与 files 端点的既有日志模式，避免生产上 500 无痕
    console.error("GET /api/resources error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } },
      { status: 500 },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POST /api/resources — submit a new resource (requireAuth, 所有登录用户；内容由管理员审核)
// ──────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate — 任何登录用户均可投稿（内容仍需管理员审核）
    const { userId } = await requireAuth(request);

    // 1b. 每用户待审 DRAFT 配额：防止单账号刷 DRAFT 堆满审核队列（此处先拦截，避免白存文件）
    const pendingCount = await prisma.submission.count({
      where: { submitterId: userId, result: null },
    });
    if (pendingCount >= MAX_PENDING_PER_USER) {
      return NextResponse.json(
        {
          error: {
            code: "QUOTA_EXCEEDED",
            message: `你已有 ${MAX_PENDING_PER_USER} 条投稿待审核，请等管理员处理后再投`,
          },
        },
        { status: 429 },
      );
    }

    // 2. Parse and validate the request body（兼容 JSON 与 multipart/form-data 文件上传）
    let body: CreateResourceBody;
    let upload: SavedUpload | null = null;
    let pendingFile: File | null = null;
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > MAX_FILE_SIZE + 1024 * 1024) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "文件大小超过 20MB 上限" } },
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

      // 兜底：即便 Content-Length 缺失或被伪造，解析后仍限制总体积与文件数，防内存/磁盘滥用
      let totalBytes = 0;
      let fileCount = 0;
      for (const value of form.values()) {
        if (value instanceof File) {
          totalBytes += value.size;
          fileCount += 1;
        }
      }
      if (totalBytes > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "上传文件总大小超过 20MB 上限" } },
          { status: 413 },
        );
      }
      if (fileCount > 10) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "上传文件数量超过上限" } },
          { status: 413 },
        );
      }

      const str = (key: string): string | undefined => {
        const v = form.get(key);
        return typeof v === "string" && v.trim() !== "" ? v : undefined;
      };

      // courseCodes 支持 JSON 字符串或重复字段两种传法
      let courseCodes: string[] | undefined;
      const rawCodes = form.get("courseCodes");
      if (typeof rawCodes === "string") {
        try {
          courseCodes = JSON.parse(rawCodes) as string[];
        } catch {
          courseCodes = undefined;
        }
      }
      if (!courseCodes) {
        const all = form.getAll("courseCodes").filter((v): v is string => typeof v === "string");
        if (all.length > 0) courseCodes = all;
      }

      body = {
        title: str("title"),
        type: str("type"),
        url: str("url"),
        summary: str("summary"),
        copyrightStatus: str("copyrightStatus"),
        applicableStage: str("applicableStage"),
        courseCodes,
      };

      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        // 仅先暂存文件引用，字段校验 + 课程存在性校验全部通过后再落盘，避免孤儿文件
        pendingFile = file;
      }
    } else {
      try {
        body = (await request.json()) as CreateResourceBody;
      } catch {
        return NextResponse.json(
          { error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } },
          { status: 400 },
        );
      }
    }

    const { title, type, url, summary, copyrightStatus, applicableStage, courseCodes } = body;

    // Validate title（对齐客户端 zod：非空且 ≤120 字符）
    if (!title || typeof title !== "string" || title.trim().length < 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Title is required" } },
        { status: 400 },
      );
    }
    if (title.trim().length > 120) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "标题最多 120 个字符" } },
        { status: 400 },
      );
    }

    // Validate type
    if (!type || !VALID_RESOURCE_TYPES.includes(type as ResourceType)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `Type must be one of: ${VALID_RESOURCE_TYPES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    // Validate copyrightStatus if provided
    if (
      copyrightStatus &&
      !VALID_COPYRIGHT_STATUSES.includes(copyrightStatus as CopyrightStatus)
    ) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `copyrightStatus must be one of: ${VALID_COPYRIGHT_STATUSES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    // Validate applicableStage if provided
    if (
      applicableStage &&
      !VALID_APPLICABLE_STAGES.includes(applicableStage)
    ) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: `applicableStage must be one of: ${VALID_APPLICABLE_STAGES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    // Validate url (must be a non-empty string if provided)
    if (url !== undefined && url !== null && (typeof url !== "string" || url.trim().length === 0)) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "url must be a non-empty string if provided" } },
        { status: 400 },
      );
    }

    // 仅允许 http/https 外链，防止 javascript: / data: 等协议被渲染为可点击链接造成存储型 XSS
    if (url && typeof url === "string" && !/^https?:\/\/\S+$/i.test(url.trim())) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "url 必须以 http:// 或 https:// 开头" } },
        { status: 400 },
      );
    }
    // 防直连 API 绕过客户端 zod：url / summary 长度上限
    if (typeof url === "string" && url.trim().length > 2048) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "url 过长（最多 2048 字符）" } },
        { status: 400 },
      );
    }
    if (summary !== undefined && summary !== null && typeof summary !== "string") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "summary 必须是字符串" } },
        { status: 400 },
      );
    }
    if (typeof summary === "string" && summary.trim().length > 500) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "摘要最多 500 个字符" } },
        { status: 400 },
      );
    }

    // Validate courseCodes（非空且 ≤20，防直连 API 传入超大数组）
    if (!Array.isArray(courseCodes) || courseCodes.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "courseCodes must be a non-empty array of course codes",
          },
        },
        { status: 400 },
      );
    }
    if (courseCodes.length > 20) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "courseCodes 最多关联 20 门课程",
          },
        },
        { status: 400 },
      );
    }

    if (!courseCodes.every((c) => typeof c === "string" && c.trim().length > 0)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Each entry in courseCodes must be a non-empty string",
          },
        },
        { status: 400 },
      );
    }

    // 去重并规范化，避免重复 courseCode 命中唯一约束返回 500
    const uniqueCourseCodes = [...new Set(courseCodes.map((c) => c.trim()))];

    // 3. Verify that all course codes exist
    const existingCourses = await prisma.course.findMany({
      where: { code: { in: uniqueCourseCodes } },
      select: { code: true },
    });

    const existingCodes = new Set(existingCourses.map((c) => c.code));
    const missingCodes = uniqueCourseCodes.filter((c) => !existingCodes.has(c));

    if (missingCodes.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "COURSES_NOT_FOUND",
            message: `The following course codes do not exist: ${missingCodes.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    // 3b. 每 IP 投稿频率：校验全部通过才计数，防止注册小号批量刷稿/刷附件。
    //     放在落盘之前，超限时不产生孤儿文件。
    const submitRl = hitRateLimit(`submit:${getClientIp(request)}`, {
      limit: SUBMIT_LIMIT_PER_IP,
      windowMs: SUBMIT_WINDOW_MS,
    });
    if (!submitRl.ok) {
      return rateLimitResponse(submitRl.retryAfterSec);
    }

    // 4. 全部校验通过后再落盘文件（此前不落盘，校验失败时不会留下孤儿文件）
    if (pendingFile) {
      try {
        upload = await saveUpload(pendingFile);
      } catch (e) {
        return NextResponse.json(
          {
            error: {
              code: "UPLOAD_ERROR",
              message: e instanceof UploadError ? e.message : "文件保存失败",
            },
          },
          { status: 400 },
        );
      }
    }

    // 5. Create the Resource, CourseResource associations, and Submission in a transaction
    const trimmedTitle = title.trim();
    const trimmedUrl = url?.trim() || null;
    const trimmedSummary = summary?.trim() || null;
    const finalCopyrightStatus = (copyrightStatus as CopyrightStatus) || "UNKNOWN";
    const finalApplicableStage = applicableStage || null;

    const result = await prisma
      .$transaction(async (tx) => {
        // 5a. Create the Resource with DRAFT status
        const resource = await tx.resource.create({
          data: {
            title: trimmedTitle,
            type: type as ResourceType,
            url: trimmedUrl,
            filePath: upload?.filePath ?? null,
            fileName: upload?.fileName ?? null,
            fileSize: upload?.fileSize ?? null,
            mimeType: upload?.mimeType ?? null,
            summary: trimmedSummary,
            copyrightStatus: finalCopyrightStatus,
            applicableStage: finalApplicableStage,
            status: "DRAFT",
            submitterId: userId,
          },
        });

        // 5b. Create CourseResource associations
        await tx.courseResource.createMany({
          data: uniqueCourseCodes.map((courseCode) => ({
            resourceId: resource.id,
            courseCode,
          })),
        });

        // 5c. Create a Submission (result is null = PENDING)
        const submission = await tx.submission.create({
          data: {
            resourceId: resource.id,
            submitterId: userId,
            submittedAt: new Date(),
          },
        });

        return { resource, submission };
      })
      .catch(async (e) => {
        // 事务失败（数据库异常等）：清理已保存的文件，避免孤儿文件堆积
        if (upload) {
          try {
            await unlink(uploadPath(upload.filePath));
          } catch {
            // 忽略清理失败，原异常优先抛出
          }
        }
        throw e;
      });

    return NextResponse.json(
      {
        data: {
          resourceId: result.resource.id,
          submissionId: result.submission.id,
          title: result.resource.title,
          type: result.resource.type,
          status: result.resource.status,
          fileName: result.resource.fileName,
          fileSize: result.resource.fileSize,
          courseCodes: uniqueCourseCodes,
          submittedAt: result.submission.submittedAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("POST /api/resources error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 },
    );
  }
}
