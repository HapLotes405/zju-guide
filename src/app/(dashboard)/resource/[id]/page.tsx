"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { APPLICABLE_STAGE_LABELS, RESOURCE_TYPE_LABELS } from "@/lib/constants";
import { handleMarkdownTab } from "@/lib/markdown-editor";
import { MarkdownContent } from "@/components/markdown-content";

interface ResourceDetail {
  id: string;
  title: string;
  type: string;
  url: string | null;
  summary: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  copyrightStatus: string;
  applicableStage: string | null;
  status: string;
  canEdit: boolean;
  submitterName: string;
  createdAt: string;
  courses: { code: string; name: string }[];
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  APPROVED: {
    label: "✅ 已审核",
    className: "bg-emerald-100 text-emerald-700",
  },
  DRAFT: {
    label: "⏳ 待审核",
    className: "bg-amber-100 text-amber-700",
  },
  REJECTED: {
    label: "未通过",
    className: "bg-red-100 text-red-700",
  },
};

export default function ResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery<ResourceDetail>({
    queryKey: ["resource", id],
    queryFn: () => api.get<ResourceDetail>(`/api/resources/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        正在加载投稿内容…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-10 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
        <p className="font-medium text-red-800">无法打开这篇投稿</p>
        <p className="mt-1 text-sm text-red-600">
          {error instanceof Error ? error.message : "投稿不存在或尚未审核"}
        </p>
        <Link href="/resources" className="mt-5 inline-flex text-sm text-blue-600 hover:underline">
          返回学习资料
        </Link>
      </div>
    );
  }

  const stageLabel = data.applicableStage
    ? (APPLICABLE_STAGE_LABELS[data.applicableStage] ?? data.applicableStage)
    : null;
  const status = STATUS_LABELS[data.status] ?? STATUS_LABELS.DRAFT!;

  const finishEditing = async () => {
    setIsEditing(false);
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ["resources"] }),
      queryClient.invalidateQueries({ queryKey: ["course-resources"] }),
    ]);
  };

  return (
    <article className="mx-auto min-w-0 max-w-4xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        {data.canEdit && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
          >
            <Pencil className="h-4 w-4" />
            编辑投稿
          </button>
        )}
      </div>

      {isEditing ? (
        <ResourceEditForm
          resource={data}
          onCancel={() => setIsEditing(false)}
          onSaved={finishEditing}
        />
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-5 py-6 sm:px-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {RESOURCE_TYPE_LABELS[data.type] ?? data.type}
              </span>
              {stageLabel && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                  {stageLabel}
                </span>
              )}
            </div>
            <h1 className="resource-title text-2xl font-bold text-slate-900">{data.title}</h1>
            <p className="mt-3 text-sm text-slate-500">
              贡献者：{data.submitterName} ·{" "}
              <span className="novecento-number">{data.createdAt.slice(0, 10)}</span>
            </p>
            {data.courses.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.courses.map((course) => (
                  <Link
                    key={course.code}
                    href={`/course/${course.code}`}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 transition hover:bg-blue-100"
                  >
                    <span className="course-code">{course.code}</span>
                    <span>{course.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </header>

          <div className="min-w-0 px-5 py-7 sm:px-8">
            {data.summary ? (
              <MarkdownContent content={data.summary} />
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">投稿者未填写正文摘要</div>
            )}
          </div>

          {(data.fileName && data.filePath) || data.url ? (
            <footer className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-8">
              {data.fileName && data.filePath && (
                <a
                  href={`/api/files/${data.filePath}`}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" />
                  下载附件：{data.fileName}
                </a>
              )}
              {data.url && (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  查看原文
                </a>
              )}
            </footer>
          ) : null}
        </div>
      )}

      {!isEditing && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <FileText className="h-3.5 w-3.5" />
          正文支持 Markdown 格式
        </div>
      )}
    </article>
  );
}

function ResourceEditForm({
  resource,
  onCancel,
  onSaved,
}: {
  resource: ResourceDetail;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(resource.title);
  const [type, setType] = useState(resource.type);
  const [stage, setStage] = useState(resource.applicableStage ?? "COURSE");
  const [url, setUrl] = useState(resource.url ?? "");
  const [summary, setSummary] = useState(resource.summary ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("请填写资源标题");
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("type", type);
      form.set("applicableStage", stage);
      form.set("url", url.trim());
      form.set("summary", summary);
      if (file) form.set("file", file);
      await api.patchForm(`/api/resources/${resource.id}`, form);
      toast.success("投稿已更新，并重新提交审核");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "更新失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5 rounded-xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm sm:p-7">
      <div>
        <h1 className="text-xl font-bold text-slate-900">编辑投稿</h1>
        <p className="mt-1 text-sm text-slate-500">保存后内容将重新进入审核队列。</p>
      </div>

      <div>
        <label htmlFor="edit-resource-title" className="mb-1.5 block text-sm font-medium text-slate-700">
          资源标题 <span className="text-red-500">*</span>
        </label>
        <input
          id="edit-resource-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-resource-type" className="mb-1.5 block text-sm font-medium text-slate-700">
            类型
          </label>
          <select
            id="edit-resource-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="edit-resource-stage" className="mb-1.5 block text-sm font-medium text-slate-700">
            适用阶段
          </label>
          <select
            id="edit-resource-stage"
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(APPLICABLE_STAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="edit-resource-url" className="mb-1.5 block text-sm font-medium text-slate-700">
          链接（可选）
        </label>
        <input
          id="edit-resource-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="edit-resource-summary" className="mb-1.5 block text-sm font-medium text-slate-700">
          正文（支持 Markdown）
        </label>
        <textarea
          id="edit-resource-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          onKeyDown={(event) => handleMarkdownTab(event, setSummary)}
          rows={10}
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">替换附件（可选，50MB 内）</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.txt,.md,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            if (nextFile && nextFile.size > 50 * 1024 * 1024) {
              toast.error("文件大小超过 50MB 上限");
              event.target.value = "";
              setFile(null);
              return;
            }
            setFile(nextFile);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
        >
          <Paperclip className="h-4 w-4" />
          {file ? file.name : resource.fileName ? `当前附件：${resource.fileName}` : "选择新附件"}
        </button>
      </div>

      <div className="flex justify-end gap-3 border-t border-blue-100 pt-5">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          取消
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存并重新审核
        </button>
      </div>
    </form>
  );
}
