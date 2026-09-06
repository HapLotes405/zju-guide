"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, FileText, ImageIcon, X, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import type { Attachment } from "./attachment-actions";

const PdfPreview = dynamic(() => import("./pdf-preview"), {
  ssr: false,
  loading: () => <ReaderLoading />,
});
const ImagePreview = dynamic(() => import("./image-preview"), {
  ssr: false,
  loading: () => <ReaderLoading />,
});

function ReaderLoading() {
  return (
    <div
      role="status"
      className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-slate-500"
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      正在加载预览…
    </div>
  );
}

export interface ReaderProps {
  url: string;
  fileName: string;
  token: string | null;
}

export default function PreviewDialog({
  attachment,
  kind,
  token,
  onClose,
  onDownload,
  downloading,
}: {
  attachment: Attachment;
  kind: "pdf" | "image";
  token: string | null;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const readerProps = {
    url: `/api/files/${encodeURIComponent(attachment.filePath)}?preview=1`,
    fileName: attachment.fileName,
    token,
  };
  const sizeLabel = attachment.fileSize
    ? attachment.fileSize < 1024 * 1024
      ? `${Math.max(1, Math.round(attachment.fileSize / 1024))} KB`
      : `${(attachment.fileSize / 1024 / 1024).toFixed(1)} MB`
    : null;
  return (
    <dialog
      ref={dialog}
      aria-label="附件预览"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-hidden border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 sm:h-[92dvh] sm:max-h-[960px] sm:w-[94vw] sm:max-w-6xl sm:rounded-xl"
    >
      <div className="flex h-full min-h-0 flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            {kind === "pdf" ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold sm:text-base" title={attachment.fileName}>
              {attachment.fileName}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {kind === "pdf" ? "PDF 文档" : "图片"}
              {sizeLabel ? ` · ${sizeLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">下载原文件</span>
            <span className="sr-only sm:hidden">下载原文件</span>
          </button>
          <button
            type="button"
            aria-label="关闭预览"
            onClick={onClose}
            autoFocus
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1" key={attempt}>
          <ReaderBoundary onRetry={() => setAttempt((n) => n + 1)}>
            {kind === "pdf" ? <PdfPreview {...readerProps} /> : <ImagePreview {...readerProps} />}
          </ReaderBoundary>
        </div>
      </div>
    </dialog>
  );
}

// Loading failures are handled by readers; this catches component/chunk failures.
class ReaderBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <ReaderError message="预览加载失败，请重试或下载原文件" onRetry={this.props.onRetry} />
    ) : (
      this.props.children
    );
  }
}

export function ReaderError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
      <FileText className="h-10 w-10 text-slate-300" />
      <p role="alert" className="max-w-md text-sm leading-6 text-slate-600">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-blue-700 hover:bg-blue-50"
      >
        重试
      </button>
      <p className="text-xs text-slate-400">也可以使用右上角按钮下载原文件</p>
    </div>
  );
}
