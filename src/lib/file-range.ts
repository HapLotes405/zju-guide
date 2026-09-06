import type { FileHandle } from "node:fs/promises";

export type FileRange =
  { kind: "full" } | { kind: "unsatisfiable" } | { kind: "partial"; start: number; end: number };

// Compare decimal strings before converting: arbitrarily large HTTP integers must
// not be rounded into a different range or overflow a file position.
function decimal(value: string): string {
  return value.replace(/^0+/, "") || "0";
}

function compare(left: string, right: string): number {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

export function parseFileRange(header: string | null, size: number): FileRange {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return { kind: "full" };
  const first = match[1] ? decimal(match[1]) : "";
  const last = match[2] ? decimal(match[2]) : "";
  // Reversed ranges are invalid syntax, so ignore them rather than emit 416.
  if (first && last && compare(first, last) > 0) return { kind: "full" };
  if (size === 0) return { kind: "unsatisfiable" };
  const sizeString = String(size);
  if (!first) {
    if (last === "0") return { kind: "unsatisfiable" };
    const suffix = compare(last, sizeString) >= 0 ? size : Number(last);
    return { kind: "partial", start: size - suffix, end: size - 1 };
  }
  if (compare(first, sizeString) >= 0) return { kind: "unsatisfiable" };
  return {
    kind: "partial",
    start: Number(first),
    end: !last || compare(last, sizeString) >= 0 ? size - 1 : Number(last),
  };
}

/** Takes ownership of this opened descriptor. No path is reopened for streaming. */
export function createFileStream(
  file: FileHandle,
  start: number,
  length: number,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  let position = start;
  let remaining = length;
  let stopped = false;
  let closing: Promise<void> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const close = (): Promise<void> => {
    if (!closing) {
      stopped = true;
      signal.removeEventListener("abort", abort);
      // FileHandle.close waits for pending file operations before closing the fd.
      closing = file.close();
    }
    return closing;
  };
  const abort = () => {
    const error = signal.reason ?? new DOMException("请求已取消", "AbortError");
    void close().then(
      () => controller.error(error),
      (closeError) => controller.error(closeError),
    );
  };

  return new ReadableStream<Uint8Array>(
    {
      start(streamController) {
        controller = streamController;
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      },
      async pull() {
        if (stopped) return;
        try {
          if (remaining === 0) {
            await close();
            controller.close();
            return;
          }
          const buffer = new Uint8Array(Math.min(64 * 1024, remaining));
          const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
          if (stopped) return;
          if (bytesRead === 0) throw new Error("文件在读取期间被截断");
          position += bytesRead;
          remaining -= bytesRead;
          if (remaining === 0) {
            // Close before making the final chunk observable to the consumer.
            await close();
            controller.enqueue(buffer.subarray(0, bytesRead));
            controller.close();
          } else {
            controller.enqueue(buffer.subarray(0, bytesRead));
          }
        } catch (error) {
          await close().catch(() => {});
          controller.error(error);
        }
      },
      cancel() {
        return close();
      },
    },
    {
      // No speculative reads: a chunk is allocated/read only with consumer demand.
      highWaterMark: 0,
    },
  );
}
