"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Minus, Plus, ScanLine } from "lucide-react";
import { ReaderError, type ReaderProps } from "./preview-dialog";
import { attachmentError } from "./attachment-actions";

export default function ImagePreview({ url, fileName, token }: ReaderProps) {
  const [source, setSource] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setSource(null);
    setError("");
    setZoom(1);
    setSize({ width: 0, height: 0 });
    void (async () => {
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw await attachmentError(response);
      if (!/^image\/(png|jpeg)(;|$)/i.test(response.headers.get("content-type") ?? ""))
        throw new Error("此文件无法作为图片预览，请下载原文件");
      const blob = await response.blob();
      if (controller.signal.aborted || localStorage.getItem("auth_access_token") !== token) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    })().catch((reason) => {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : "图片加载失败");
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token, attempt]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setBounds({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [error]);
  const fit =
    size.width && size.height
      ? Math.min(
          1,
          Math.max(1, bounds.width - 32) / size.width,
          Math.max(1, bounds.height - 32) / size.height,
        )
      : 1;
  const buttonClass =
    "flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-slate-600 hover:bg-slate-200 disabled:opacity-30";
  if (error) return <ReaderError message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <div className="flex shrink-0 items-center justify-center gap-1 border-b border-slate-200 bg-slate-50 p-2 text-sm">
        <button
          aria-label="缩小"
          className={buttonClass}
          disabled={zoom <= 0.5 || !size.width}
          onClick={() => setZoom((n) => Math.max(0.5, n - 0.25))}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span aria-label="缩放比例" className="min-w-12 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          aria-label="放大"
          className={buttonClass}
          disabled={zoom >= 3 || !size.width}
          onClick={() => setZoom((n) => Math.min(3, n + 0.25))}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          aria-label="适应窗口"
          title="适应窗口"
          className={buttonClass}
          onClick={() => setZoom(1)}
        >
          <ScanLine className="h-4 w-4" />
        </button>
      </div>
      <div ref={viewport} className="min-h-0 flex-1 overflow-auto overscroll-contain">
        <div className="flex min-h-full w-fit min-w-full items-center justify-center p-4">
          {!size.width && (
            <div role="status" className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              正在加载图片…
            </div>
          )}
          {/* The authenticated object URL is revoked when the reader closes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {source && (
            <img
              src={source}
              alt={fileName}
              draggable={false}
              className="max-w-none shrink-0 object-contain shadow-sm"
              style={
                size.width
                  ? { width: size.width * fit * zoom, height: size.height * fit * zoom }
                  : { position: "absolute", opacity: 0 }
              }
              onLoad={(event) => {
                const image = event.currentTarget;
                if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 20_000_000)
                  setError("图片尺寸过大或无效，请下载原文件查看");
                else setSize({ width: image.naturalWidth, height: image.naturalHeight });
              }}
              onError={() => setError("图片无法显示，请重试或下载原文件")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
