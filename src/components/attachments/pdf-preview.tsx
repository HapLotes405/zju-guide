"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, ScanLine, Loader2 } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { ReaderError, type ReaderProps } from "./preview-dialog";
import { attachmentError } from "./attachment-actions";
import { canvasLayout } from "./preview-layout";

const assetRoot = `/pdfjs/${pdfjs.version}/`;
const buttonClass =
  "flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-slate-600 hover:bg-slate-200 disabled:opacity-30";

export default function PdfPreview({ url, fileName, token }: ReaderProps) {
  const [document, setDocument] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [width, setWidth] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let loading: pdfjs.PDFDocumentLoadingTask | undefined;
    let nativeWorker: Worker | undefined;
    let worker: pdfjs.PDFWorker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposing: Promise<void> | undefined;
    const current = () => !cancelled && localStorage.getItem("auth_access_token") === token;
    const dispose = () =>
      (disposing ??= (async () => {
        // Allow the external worker to acknowledge PDF.js teardown before stopping it.
        // A failed worker cannot acknowledge; cap that wait so it is still released.
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            loading?.destroy().catch(() => {}),
            new Promise<void>((resolve) => {
              deadline = setTimeout(resolve, 1000);
            }),
          ]);
        } finally {
          clearTimeout(deadline);
          worker?.destroy();
          nativeWorker?.terminate();
        }
      })());
    setDocument(null);
    setError("");
    setPageNumber(1);
    setZoom(1);
    setRendering(true);
    const load = async () => {
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      timer = setTimeout(() => controller.abort(new Error("附件连接超时，请重试")), 30000);
      const response = await fetch(url, {
        method: "HEAD",
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!response.ok) throw await attachmentError(response);
      if (!current()) return;
      if (!response.headers.get("content-type")?.includes("application/pdf"))
        throw new Error("此文件无法作为 PDF 预览，请下载原文件");
      nativeWorker = new Worker(`${assetRoot}pdf.worker.min.mjs`, { type: "module" });
      const workerFailure = new Promise<never>((_, reject) => {
        nativeWorker!.addEventListener(
          "error",
          () => {
            const reason = new Error("预览组件加载失败，请重试或下载原文件");
            reject(reason);
            if (current()) {
              setDocument(null);
              setError(reason.message);
            }
            void dispose();
          },
          { once: true },
        );
        timer = setTimeout(() => reject(new Error("预览加载超时，请重试或下载原文件")), 45000);
      });
      worker = pdfjs.PDFWorker.create({ port: nativeWorker });
      loading = pdfjs.getDocument({
        url,
        httpHeaders: headers,
        worker,
        cMapUrl: `${assetRoot}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetRoot}standard_fonts/`,
        wasmUrl: `${assetRoot}wasm/`,
        iccUrl: `${assetRoot}iccs/`,
        disableAutoFetch: true,
        disableStream: true,
        enableXfa: false,
        maxImageSize: 20_000_000,
        canvasMaxAreaInBytes: 16_000_000,
      });
      const result = await Promise.race([loading.promise, workerFailure]);
      clearTimeout(timer);
      if (current()) setDocument(result);
      else await dispose();
    };
    void load()
      .catch((reason) => {
        if (current())
          setError(
            reason?.name === "PasswordException"
              ? "此 PDF 需要密码，请下载后打开"
              : reason instanceof Error
                ? reason.message
                : "PDF 无法预览，请下载原文件",
          );
        void dispose();
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      void dispose();
    };
  }, [url, token, attempt]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [error]);

  useEffect(() => {
    const host = canvasHost.current;
    if (!document || !host || !width) return;
    let cancelled = false;
    let task: pdfjs.RenderTask | undefined;
    let page: pdfjs.PDFPageProxy | undefined;
    let settled = false;
    const canvas = window.document.createElement("canvas");
    canvas.setAttribute("aria-label", `${fileName}，第 ${pageNumber} 页`);
    canvas.className = "block bg-white shadow-sm";
    host.replaceChildren(canvas);
    setRendering(true);
    const render = async () => {
      page = await document.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const layout = canvasLayout(
        base.width,
        base.height,
        width,
        zoom,
        window.devicePixelRatio || 1,
      );
      canvas.width = layout.width;
      canvas.height = layout.height;
      canvas.style.width = `${layout.cssWidth}px`;
      canvas.style.height = `${layout.cssHeight}px`;
      task = page.render({
        canvas,
        viewport: page.getViewport({ scale: layout.scale }),
        transform: [layout.ratio, 0, 0, layout.ratio, 0, 0],
      });
      await task.promise;
      if (!cancelled) setRendering(false);
    };
    const releasePage = () => {
      page?.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    };
    void render()
      .catch((reason) => {
        if (!cancelled && reason?.name !== "RenderingCancelledException")
          setError("此页无法显示，请重试或下载原文件");
      })
      .finally(() => {
        settled = true;
        if (cancelled) releasePage();
      });
    return () => {
      cancelled = true;
      task?.cancel();
      canvas.remove();
      if (settled) releasePage();
    };
  }, [document, pageNumber, zoom, width, fileName]);

  if (error) return <ReaderError message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50 px-2 py-2 text-sm">
        <div className="flex items-center gap-1">
          <button
            aria-label="上一页"
            className={buttonClass}
            disabled={!document || pageNumber <= 1 || rendering}
            onClick={() => {
              setPageNumber((n) => n - 1);
              viewport.current?.scrollTo(0, 0);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span aria-label="当前页" className="min-w-16 text-center tabular-nums">
            {document ? `${pageNumber} / ${document.numPages}` : "— / —"}
          </span>
          <button
            aria-label="下一页"
            className={buttonClass}
            disabled={!document || pageNumber >= document.numPages || rendering}
            onClick={() => {
              setPageNumber((n) => n + 1);
              viewport.current?.scrollTo(0, 0);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="缩小"
            className={buttonClass}
            disabled={zoom <= 0.5 || !document}
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
            disabled={zoom >= 3 || !document}
            onClick={() => setZoom((n) => Math.min(3, n + 0.25))}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            aria-label="适应宽度"
            title="适应宽度"
            className={buttonClass}
            onClick={() => setZoom(1)}
          >
            <ScanLine className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={viewport} className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
        {rendering && (
          <div
            role="status"
            className="sticky top-3 z-10 mx-auto mt-3 flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载页面…
          </div>
        )}
        <div ref={canvasHost} className="mx-auto w-fit min-w-0 p-4" />
      </div>
    </div>
  );
}
