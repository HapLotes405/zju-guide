import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/courses/[code]/resources — 获取某门课的已审核资源
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    const resources = await prisma.courseResource.findMany({
      where: { courseCode: code, resource: { status: "APPROVED" } },
      include: { resource: { include: { submitter: { select: { username: true } } } } },
      orderBy: { resource: { createdAt: "desc" } },
    });

    const data = resources.map((cr) => ({
      id: cr.resource.id, title: cr.resource.title, type: cr.resource.type,
      url: cr.resource.url, summary: cr.resource.summary,
      filePath: cr.resource.filePath, fileName: cr.resource.fileName, fileSize: cr.resource.fileSize,
      copyrightStatus: cr.resource.copyrightStatus, applicableStage: cr.resource.applicableStage,
      submitterName: cr.resource.submitter.username, createdAt: cr.resource.createdAt.toISOString(),
    }));

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } }, { status: 500 });
  }
}
