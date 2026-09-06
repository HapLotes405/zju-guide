import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectFilePreview } from "@/lib/file-preview";

let directory: string;
let sequence = 0;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "mse-file-preview-"));
});
afterAll(async () => {
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(directory));
  if (!relative.startsWith("mse-file-preview-") || relative.includes(path.sep))
    throw new Error("Unsafe cleanup");
  await rm(directory, { recursive: true, force: true });
});

async function inspect(bytes: Buffer, name: string) {
  const filename = path.join(directory, `${sequence++}.bin`);
  await writeFile(filename, bytes);
  const file = await open(filename, "r");
  try {
    return await inspectFilePreview(file, name, (await file.stat()).size);
  } finally {
    await file.close();
  }
}

// Header fixtures exercise only pre-decode screening, not full image validity.
function png(width: number, height: number) {
  const buffer = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(buffer);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 2;
  return buffer;
}

function jpeg(width: number, height: number, marker = 0xc0) {
  const buffer = Buffer.from([
    0xff,
    0xd8,
    0xff,
    marker,
    0,
    17,
    8,
    0,
    0,
    0,
    0,
    3,
    1,
    0x11,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
    0xff,
    0xd9,
  ]);
  buffer.writeUInt16BE(height, 7);
  buffer.writeUInt16BE(width, 9);
  return buffer;
}

describe("preview header and dimension screening from a real opened file", () => {
  it.each([0, 512, 1016])(
    "accepts a PDF header at byte %i within the first 1024 bytes",
    async (offset) => {
      expect(
        await inspect(
          Buffer.concat([Buffer.alloc(offset, 32), Buffer.from("%PDF-1.7\n")]),
          "note.PDF",
        ),
      ).toEqual({ mimeType: "application/pdf" });
    },
  );

  it.each([1017, 1024, 2048])(
    "rejects a PDF header outside the screening window: %i",
    async (offset) => {
      await expect(
        inspect(Buffer.concat([Buffer.alloc(offset, 32), Buffer.from("%PDF-1.7\n")]), "note.pdf"),
      ).rejects.toMatchObject({ status: 415, code: "PREVIEW_UNSUPPORTED" });
    },
  );

  it.each([
    ["note.txt", Buffer.from("%PDF-1.7\n")],
    ["note.svg", Buffer.from("<svg/>")],
    ["note.pdf", Buffer.from("<html>not a PDF</html>")],
    ["note.jpg", png(1, 1)],
    ["note.png", jpeg(1, 1)],
    ["note.pdf", Buffer.from("%PDF-fake")],
    ["note.pdf", Buffer.alloc(0)],
  ])("rejects unsupported/mismatched magic for %s", async (name, buffer) => {
    await expect(inspect(buffer, name)).rejects.toMatchObject({
      status: 415,
      code: "PREVIEW_UNSUPPORTED",
    });
  });

  it("reads dimensions from a real 1x1 PNG", async () => {
    const buffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    );
    expect(await inspect(buffer, "note.PNG")).toEqual({
      mimeType: "image/png",
      width: 1,
      height: 1,
    });
  });

  it.each(["png", "jpg", "jpeg"])("accepts exactly 20 million pixels: %s", async (extension) => {
    const buffer = extension === "png" ? png(5000, 4000) : jpeg(5000, 4000);
    expect(await inspect(buffer, `note.${extension}`)).toEqual({
      mimeType: extension === "png" ? "image/png" : "image/jpeg",
      width: 5000,
      height: 4000,
    });
  });

  it.each(["png", "jpg"])(
    "rejects over 20 million pixels and zero dimensions: %s",
    async (extension) => {
      const make = extension === "png" ? png : jpeg;
      for (const [width, height] of [
        [5000, 4001],
        [0, 10],
        [10, 0],
        [65535, 65535],
      ] as const) {
        await expect(inspect(make(width, height), `note.${extension}`)).rejects.toMatchObject({
          status: 422,
          code: "PREVIEW_INVALID_IMAGE",
        });
      }
    },
  );

  it("rejects truncated PNG IHDR and wrong IHDR fields", async () => {
    for (const length of [8, 16, 24, 32]) {
      await expect(inspect(png(10, 10).subarray(0, length), "note.png")).rejects.toMatchObject({
        status: 422,
      });
    }
    for (const [offset, value] of [
      [11, 12],
      [12, 0],
      [24, 3],
      [25, 5],
      [26, 1],
      [27, 1],
      [28, 2],
    ] as const) {
      const buffer = png(10, 10);
      buffer[offset] = value;
      await expect(inspect(buffer, "note.png")).rejects.toMatchObject({ status: 422 });
    }
  });

  it("finds baseline/progressive JPEG dimensions beyond large metadata segments", async () => {
    const app = Buffer.alloc(65537);
    app[0] = 0xff;
    app[1] = 0xe1;
    app.writeUInt16BE(65535, 2);
    const frame = jpeg(1200, 800, 0xc2);
    const buffer = Buffer.concat([frame.subarray(0, 2), app, app, frame.subarray(2)]);
    expect(await inspect(buffer, "note.JPEG")).toEqual({
      mimeType: "image/jpeg",
      width: 1200,
      height: 800,
    });
  });

  it("rejects excessive JPEG marker padding before walking the whole file", async () => {
    const frame = jpeg(320, 240);
    const buffer = Buffer.concat([
      frame.subarray(0, 2),
      Buffer.alloc(1024 * 1024, 0xff),
      frame.subarray(2),
    ]);
    await expect(inspect(buffer, "padding.jpg")).rejects.toMatchObject({
      status: 422,
      code: "PREVIEW_INVALID_IMAGE",
      message: expect.stringContaining("过于复杂"),
    });
  });

  it("allows up to 1024 JPEG marker prefix/fill bytes but rejects the next byte", async () => {
    const frame = jpeg(320, 240);
    const withPadding = (length: number) =>
      Buffer.concat([frame.subarray(0, 2), Buffer.alloc(length, 0xff), frame.subarray(2)]);
    expect(await inspect(withPadding(1023), "padding.jpg")).toMatchObject({
      width: 320,
      height: 240,
    });
    await expect(inspect(withPadding(1024), "padding.jpg")).rejects.toMatchObject({ status: 422 });
  });

  it("bounds JPEG metadata traversal to the first 1 MiB including skipped segments", async () => {
    const app = Buffer.alloc(65537);
    app[0] = 0xff;
    app[1] = 0xe1;
    app.writeUInt16BE(65535, 2);
    const frame = jpeg(320, 240);
    const withSegments = (count: number) =>
      Buffer.concat([
        frame.subarray(0, 2),
        ...Array.from({ length: count }, () => app),
        frame.subarray(2),
      ]);
    expect(await inspect(withSegments(15), "metadata.jpg")).toMatchObject({
      width: 320,
      height: 240,
    });
    await expect(inspect(withSegments(16), "metadata.jpg")).rejects.toMatchObject({
      status: 422,
      code: "PREVIEW_INVALID_IMAGE",
      message: expect.stringContaining("过于复杂"),
    });
  });

  it("bounds JPEG marker count even when tiny metadata segments fit below the byte budget", async () => {
    const frame = jpeg(320, 240);
    const withSegments = (count: number) =>
      Buffer.concat([
        frame.subarray(0, 2),
        ...Array.from({ length: count }, () => Buffer.from([0xff, 0xe1, 0, 2])),
        frame.subarray(2),
      ]);
    expect(await inspect(withSegments(4095), "markers.jpg")).toMatchObject({
      width: 320,
      height: 240,
    });
    await expect(inspect(withSegments(4096), "markers.jpg")).rejects.toMatchObject({ status: 422 });
  });

  it("bounds aggregate JPEG parser operations across many short padded markers", async () => {
    const frame = jpeg(320, 240);
    const paddedApp = Buffer.concat([Buffer.alloc(32, 0xff), Buffer.from([0xe1, 0, 2])]);
    const buffer = Buffer.concat([
      frame.subarray(0, 2),
      ...Array.from({ length: 1000 }, () => paddedApp),
      frame.subarray(2),
    ]);
    await expect(inspect(buffer, "padded-markers.jpg")).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("过于复杂"),
    });
  });

  it("does not read for an already aborted preview inspection", async () => {
    const filename = path.join(directory, `${sequence++}.bin`);
    await writeFile(filename, jpeg(1, 1));
    const file = await open(filename, "r");
    const read = vi.spyOn(file, "read");
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(
        inspectFilePreview(file, "note.jpg", 23, controller.signal),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(read).not.toHaveBeenCalled();
    } finally {
      await file.close();
    }
  });

  it("rejects malformed/truncated JPEG segments and missing frame dimensions", async () => {
    const malformed = [
      jpeg(1, 1).subarray(0, 10),
      Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 1]),
      Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]),
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2]),
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      Buffer.from([0xff, 0xd8, 0x01, 0xc0]),
      Buffer.from([0xff, 0xd8, 0xff, 0xff]),
    ];
    const wrongLength = jpeg(1, 1);
    wrongLength[5] = 8;
    malformed.push(wrongLength);
    for (const buffer of malformed) {
      await expect(inspect(buffer, "note.jpg")).rejects.toMatchObject({
        status: 422,
        code: "PREVIEW_INVALID_IMAGE",
      });
    }
  });

  it("handles JPEG marker fill bytes without treating segment payload as markers", async () => {
    const frame = jpeg(320, 240);
    const app = Buffer.from([0xff, 0xe1, 0, 6, 0xff, 0xc0, 0, 0]);
    const buffer = Buffer.concat([
      frame.subarray(0, 2),
      app,
      Buffer.from([0xff]),
      frame.subarray(2),
    ]);
    expect(await inspect(buffer, "note.jpg")).toMatchObject({ width: 320, height: 240 });
  });
});
