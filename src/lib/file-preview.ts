import type { FileHandle } from "node:fs/promises";
import path from "node:path";

const MAX_PREVIEW_PIXELS = 20_000_000;
const MAX_JPEG_HEADER_BYTES = 1024 * 1024;
const MAX_JPEG_MARKERS = 4096;
const MAX_JPEG_MARKER_PREFIX_BYTES = 1024;
const MAX_JPEG_PARSE_STEPS = 16_384;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const JPEG_FRAMES = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export class FilePreviewError extends Error {
  constructor(
    readonly code: "PREVIEW_UNSUPPORTED" | "PREVIEW_INVALID_IMAGE",
    message: string,
    readonly status: 415 | 422,
  ) {
    super(message);
  }
}

export interface FilePreview {
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  width?: number;
  height?: number;
}

function unsupported(): never {
  throw new FilePreviewError(
    "PREVIEW_UNSUPPORTED",
    "不支持预览此文件，或扩展名与文件头不匹配；请下载后查看",
    415,
  );
}

function invalidImage(): never {
  throw new FilePreviewError(
    "PREVIEW_INVALID_IMAGE",
    "图片头或尺寸信息异常、文件可能已截断，无法预览；请下载后查看",
    422,
  );
}

function complexImage(): never {
  throw new FilePreviewError(
    "PREVIEW_INVALID_IMAGE",
    "图片头信息过大或过于复杂，无法预览；请下载后查看",
    422,
  );
}

function dimensions(
  mimeType: "image/png" | "image/jpeg",
  width: number,
  height: number,
): FilePreview {
  if (!width || !height) invalidImage();
  // Division avoids overflowing a product derived from untrusted dimensions.
  if (width > MAX_PREVIEW_PIXELS / height) {
    throw new FilePreviewError(
      "PREVIEW_INVALID_IMAGE",
      "图片超过 2000 万像素，无法预览；请下载后查看",
      422,
    );
  }
  return { mimeType, width, height };
}

async function readAt(
  file: FileHandle,
  position: number,
  length: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  signal?.throwIfAborted();
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    signal?.throwIfAborted();
    const { bytesRead } = await file.read(buffer, offset, length - offset, position + offset);
    signal?.throwIfAborted();
    if (!bytesRead) break;
    offset += bytesRead;
  }
  return buffer.subarray(0, offset);
}

function inspectPng(header: Buffer): FilePreview {
  if (!header.subarray(0, 8).equals(PNG_SIGNATURE)) unsupported();
  if (
    header.length < 33 ||
    header.readUInt32BE(8) !== 13 ||
    header.toString("ascii", 12, 16) !== "IHDR"
  )
    invalidImage();
  const depth = header[24]!;
  const color = header[25]!;
  const depths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (!depths[color]?.includes(depth) || header[26] !== 0 || header[27] !== 0 || header[28]! > 1)
    invalidImage();
  return dimensions("image/png", header.readUInt32BE(16), header.readUInt32BE(20));
}

async function inspectJpeg(
  file: FileHandle,
  size: number,
  header: Buffer,
  signal?: AbortSignal,
): Promise<FilePreview> {
  if (header[0] !== 0xff || header[1] !== 0xd8) unsupported();
  // Metadata can push SOF beyond a fixed 35-byte/64KB sniff. Bound both the
  // traversed header and parser work; a bounded read buffer alone does not cap
  // the Promise/CPU cost of long marker padding or many tiny segments.
  let window = header;
  let windowStart = 0;
  let steps = 0;
  const read = async (position: number, length: number): Promise<Buffer> => {
    signal?.throwIfAborted();
    if (++steps > MAX_JPEG_PARSE_STEPS) complexImage();
    if (position + length > MAX_JPEG_HEADER_BYTES) complexImage();
    if (position + length > size) invalidImage();
    if (position < windowStart || position + length > windowStart + window.length) {
      windowStart = position;
      window = await readAt(
        file,
        position,
        Math.min(64 * 1024, size - position, MAX_JPEG_HEADER_BYTES - position),
        signal,
      );
    }
    const result = window.subarray(position - windowStart, position - windowStart + length);
    if (result.length !== length) invalidImage();
    return result;
  };

  let position = 2;
  let markers = 0;
  while (position < size) {
    if (++markers > MAX_JPEG_MARKERS) complexImage();
    if ((await read(position++, 1))[0] !== 0xff) invalidImage();
    let marker: number;
    let prefixBytes = 1;
    do {
      marker = (await read(position++, 1))[0]!;
      if (marker === 0xff && ++prefixBytes > MAX_JPEG_MARKER_PREFIX_BYTES) complexImage();
    } while (marker === 0xff);
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0xda ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
      invalidImage();
    if (marker === 0x01) continue; // TEM has no segment length.
    const length = (await read(position, 2)).readUInt16BE(0);
    if (position + length > MAX_JPEG_HEADER_BYTES) complexImage();
    if (length < 2 || position + length > size) invalidImage();
    if (JPEG_FRAMES.has(marker)) {
      if (length < 11) invalidImage();
      const frame = await read(position, 8);
      const components = frame[7]!;
      if (!components || length !== 8 + 3 * components || ![8, 12, 16].includes(frame[2]!))
        invalidImage();
      // Ensure the complete SOF header is present, without reading image data.
      await read(position, length);
      return dimensions("image/jpeg", frame.readUInt16BE(5), frame.readUInt16BE(3));
    }
    position += length;
  }
  return invalidImage();
}

/**
 * Pre-decode screening only: extension + magic + image dimensions. This does not
 * prove complete PDF/image validity; the viewer still needs to handle decode errors.
 * All reads are positional on the caller's already authorized, opened descriptor.
 */
export async function inspectFilePreview(
  file: FileHandle,
  name: string,
  size: number,
  signal?: AbortSignal,
): Promise<FilePreview> {
  signal?.throwIfAborted();
  const extension = path.extname(name).toLowerCase();
  if (![".pdf", ".png", ".jpg", ".jpeg"].includes(extension)) unsupported();
  const header = await readAt(file, 0, Math.min(1024, size), signal);
  if (extension === ".pdf") {
    if (!/%PDF-\d\.\d/.test(header.toString("latin1"))) unsupported();
    return { mimeType: "application/pdf" };
  }
  if (extension === ".png") return inspectPng(header);
  return inspectJpeg(file, size, header, signal);
}
