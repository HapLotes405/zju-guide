"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

const PreviewDialog = dynamic(() => import("./preview-dialog"), { ssr: false });

export interface Attachment {
  filePath: string;
  fileName: string;
  fileSize?: number | null;
  status?: string;
}

export function attachmentKind(filePath: string): "pdf" | "image" | null {
  const extension = filePath.split(".").pop()?.toLowerCase();
  return extension === "pdf"
    ? "pdf"
    : ["png", "jpg", "jpeg"].includes(extension ?? "")
      ? "image"
      : null;
}

export async function attachmentError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  return new Error(
    body?.error?.message ??
      (response.status === 404
        ? "文件不存在或已被删除"
        : response.status === 401 || response.status === 403
          ? "暂时无法查看此附件，请检查登录状态或审核状态"
          : response.status === 415 || response.status === 422
            ? "此文件的格式或尺寸不适合在线预览，请下载原文件查看"
            : "附件加载失败，请稍后重试"),
  );
}

export function AttachmentActions({
  filePath,
  fileName,
  fileSize,
  status = "APPROVED",
}: Attachment) {
  const { user } = useAuth();
  const identity = `${user?.id ?? "anonymous"}:${user?.role ?? "VISITOR"}`;
  const [opened, setOpened] = useState<{
    identity: string;
    filePath: string;
    token: string | null;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const downloadController = useRef<AbortController | null>(null);
  const kind = attachmentKind(filePath);
  const allowed = status === "APPROVED" || user?.role === "ADMIN";

  useEffect(() => {
    const invalidate = () => {
      setOpened(null);
      downloadController.current?.abort();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "auth_access_token" || event.key === null) invalidate();
    };
    window.addEventListener("storage", storage);
    invalidate();
    setDownloading(false);
    return () => {
      window.removeEventListener("storage", storage);
      downloadController.current?.abort();
    };
  }, [identity, filePath, status]);

  const download = async () => {
    if (downloadController.current) return;
    const controller = new AbortController();
    downloadController.current = controller;
    const token = localStorage.getItem("auth_access_token");
    setDownloading(true);
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(filePath)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw await attachmentError(response);
      const blob = await response.blob();
      if (controller.signal.aborted || token !== localStorage.getItem("auth_access_token")) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(error instanceof Error ? error.message : "附件下载失败");
    } finally {
      if (downloadController.current === controller) {
        downloadController.current = null;
        setDownloading(false);
      }
    }
  };

  if (!allowed) return <span className="text-xs text-amber-700">附件审核通过后可查看</span>;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" title={fileName}>
      {kind && (
        <button
          type="button"
          onClick={() =>
            setOpened({ identity, filePath, token: localStorage.getItem("auth_access_token") })
          }
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 transition hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          预览
        </button>
      )}
      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 disabled:opacity-50"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {downloading ? "下载中…" : "下载附件"}
      </button>
      {opened && opened.identity === identity && opened.filePath === filePath && kind && (
        <PreviewDialog
          key={`${identity}:${filePath}`}
          attachment={{ filePath, fileName, fileSize, status }}
          kind={kind}
          token={opened.token}
          onClose={() => setOpened(null)}
          onDownload={download}
          downloading={downloading}
        />
      )}
    </div>
  );
}
