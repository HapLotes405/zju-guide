import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  handles: [] as FileHandle[],
  opened: vi.fn(),
  pathStat: vi.fn(),
  wholeRead: vi.fn(),
  afterOpen: undefined as undefined | ((handle: FileHandle) => Promise<void>),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { resource: { findFirst: mocks.findFirst } } }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: vi.fn((...args: Parameters<typeof actual.stat>) => {
      mocks.pathStat();
      return actual.stat(...args);
    }),
    readFile: vi.fn((...args: Parameters<typeof actual.readFile>) => {
      mocks.wholeRead();
      return actual.readFile(...args);
    }),
    open: vi.fn(async (...args: Parameters<typeof actual.open>) => {
      mocks.opened();
      const handle = await actual.open(...args);
      mocks.handles.push(handle);
      vi.spyOn(handle, "read");
      vi.spyOn(handle, "stat");
      vi.spyOn(handle, "close");
      await mocks.afterOpen?.(handle);
      return handle;
    }),
  };
});

let directory: string;
let route: typeof import("@/app/api/files/[name]/route");
let adminToken: string;
let visitorToken: string;
const bodies: Response[] = [];
const bytes = Buffer.from("0123456789");
let resource: { fileName: string; mimeType: string; status: string };

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "mse-file-response-"));
  vi.stubEnv("UPLOAD_DIR", directory);
  route = await import("@/app/api/files/[name]/route");
  adminToken = await signToken({ sub: "admin", role: "ADMIN" });
  visitorToken = await signToken({ sub: "visitor", role: "USER" });
});

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.handles.length = 0;
  mocks.afterOpen = undefined;
  resource = { fileName: "讲义 '()*.pdf", mimeType: "application/pdf", status: "APPROVED" };
  mocks.findFirst.mockImplementation(async () => resource);
  await writeFile(path.join(directory, "sample.pdf"), bytes);
});

afterEach(async () => {
  for (const response of bodies.splice(0)) {
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
  for (const handle of mocks.handles) {
    if (handle.fd !== -1) await handle.close();
  }
});

afterAll(async () => {
  vi.unstubAllEnvs();
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(directory));
  if (!relative.startsWith("mse-file-response-") || relative.includes(path.sep)) {
    throw new Error("Unsafe temporary directory cleanup");
  }
  await rm(directory, { recursive: true, force: true });
});

async function request(
  options: {
    name?: string;
    range?: string;
    ifRange?: string;
    preview?: string;
    token?: string;
    method?: "GET" | "HEAD";
    signal?: AbortSignal;
  } = {},
) {
  const name = options.name ?? "sample.pdf";
  const headers = new Headers();
  if (options.range !== undefined) headers.set("Range", options.range);
  if (options.ifRange !== undefined) headers.set("If-Range", options.ifRange);
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  const method = options.method ?? "GET";
  const url = `http://localhost/api/files/${encodeURIComponent(name)}${options.preview ? `?preview=${options.preview}` : ""}`;
  const response = await route[method](
    new NextRequest(url, { method, headers, signal: options.signal }),
    {
      params: Promise.resolve({ name }),
    },
  );
  bodies.push(response);
  return response;
}

function expectPrivate(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Vary")).toBe("Authorization");
}

describe("real file handler: preview and download", () => {
  it("streams normal downloads with safe disposition and no account cache", async () => {
    const response = await request();
    expect(await response.text()).toBe(bytes.toString());
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename*=UTF-8''%E8%AE%B2%E4%B9%89%20%27%28%29%2A.pdf",
    );
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(mocks.wholeRead).not.toHaveBeenCalled();
    expect(mocks.pathStat).not.toHaveBeenCalled();
    expect(mocks.handles[0]?.stat).toHaveBeenCalledTimes(1);
    expect(mocks.handles[0]?.fd).toBe(-1);
  });

  it("previews a PDF with a header within the first 1024 bytes using controlled MIME", async () => {
    const pdf = Buffer.concat([Buffer.alloc(500, 32), Buffer.from("%PDF-1.7\nfixture\n%%EOF")]);
    await writeFile(path.join(directory, "sample.pdf"), pdf);
    resource.mimeType = "text/html";
    const response = await request({ preview: "1" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toMatch(/^inline; filename\*=/);
    expectPrivate(response);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
  });

  it("rejects mismatched preview magic without preventing download", async () => {
    const response = await request({ preview: "1" });
    expect(response.status).toBe(415);
    expect((await response.json()).error).toMatchObject({
      code: "PREVIEW_UNSUPPORTED",
      message: expect.stringMatching(/[\u4e00-\u9fff]/),
    });
    expectPrivate(response);
    expect((await request()).status).toBe(200);
  });

  it("rejects unsupported extensions even with PDF magic; only preview=1 opts in", async () => {
    await writeFile(path.join(directory, "archive.zip"), "%PDF-1.7\n");
    const rejected = await request({ name: "archive.zip", preview: "1" });
    expect(rejected.status).toBe(415);
    expect((await request({ name: "archive.zip" })).status).toBe(200);
    expect((await request({ preview: "true" })).status).toBe(200);
  });

  it("does preview validation against the full file before selecting a range", async () => {
    await writeFile(path.join(directory, "sample.pdf"), "%PDF-1.7\nbody");
    const response = await request({ range: "bytes=9-12", preview: "1" });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("body");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("bounds image pixels before returning even a tiny range", async () => {
    const png = Buffer.alloc(33);
    Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(png);
    png.writeUInt32BE(5000, 16);
    png.writeUInt32BE(4001, 20);
    png[24] = 8;
    png[25] = 2;
    await writeFile(path.join(directory, "huge.png"), png);
    const response = await request({ name: "huge.png", preview: "1", range: "bytes=0-0" });
    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toMatch(/2000.*万|20.*000.*000/);
    expect((await request({ name: "huge.png" })).status).toBe(200);
  });
});

describe("single byte ranges", () => {
  it.each([
    '"outdated-etag"',
    'W/"old-version"',
    "Wed, 21 Oct 2015 07:28:00 GMT",
    "invalid-validator",
    "",
  ])("ignores Range when If-Range cannot be validated: %s", async (ifRange) => {
    const response = await request({ range: "bytes=2-5", ifRange });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(await response.text()).toBe("0123456789");
  });

  it("also ignores an unsatisfiable range with an unverified If-Range date", async () => {
    const response = await request({
      range: "bytes=99999-",
      ifRange: "Wed, 21 Oct 2015 07:28:00 GMT",
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("0123456789");
  });

  it.each([
    ["bytes=2-5", "2345", "bytes 2-5/10"],
    ["bytes=7-", "789", "bytes 7-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
    ["bytes=0-0", "0", "bytes 0-0/10"],
    ["bytes=8-9999999999999999999999999999999", "89", "bytes 8-9/10"],
    ["bytes=-9999999999999999999999999999999", "0123456789", "bytes 0-9/10"],
    ["BYTES=0002-0004", "234", "bytes 2-4/10"],
  ])("%s returns exactly the selected bytes", async (range, expected, contentRange) => {
    const response = await request({ range });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe(contentRange);
    expect(response.headers.get("Content-Length")).toBe(String(expected.length));
    expectPrivate(response);
    expect(await response.text()).toBe(expected);
  });

  it.each(["bytes=10-", "bytes=9999999999999999999999999999999-", "bytes=-0"])(
    "%s is unsatisfiable",
    async (range) => {
      const response = await request({ range });
      expect(response.status).toBe(416);
      expect(response.headers.get("Content-Range")).toBe("bytes */10");
      expectPrivate(response);
      expect(mocks.handles[0]?.fd).toBe(-1);
    },
  );

  it.each([
    "bytes=0-1,4-5",
    "bytes=5-2",
    "bytes=-",
    "bytes=abc",
    "items=0-1",
    "bytes=+1-2",
    "bytes=1.0-2",
    "bytes=1 -2",
    "bytes=0-1junk",
  ])("ignores invalid or multiple ranges: %s", async (range) => {
    const response = await request({ range });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(await response.text()).toBe("0123456789");
  });

  it("serves an empty file and rejects any otherwise valid range on it", async () => {
    await writeFile(path.join(directory, "sample.pdf"), "");
    const full = await request();
    expect(full.status).toBe(200);
    expect(full.headers.get("Content-Length")).toBe("0");
    expect(await full.text()).toBe("");
    for (const range of ["bytes=0-", "bytes=-1", "bytes=0-0"]) {
      const response = await request({ range });
      expect(response.status).toBe(416);
      expect(response.headers.get("Content-Range")).toBe("bytes */0");
    }
  });
});

describe("authorization and HEAD", () => {
  it.each(["DRAFT", "PENDING", "REJECTED", "ARCHIVED", "UNKNOWN"])(
    "checks %s before any file I/O for every request variant",
    async (status) => {
      resource.status = status;
      for (const method of ["GET", "HEAD"] as const) {
        for (const preview of [undefined, "1"]) {
          for (const range of [undefined, "bytes=0-0"]) {
            const anon = await request({ method, preview, range });
            const visitor = await request({ method, preview, range, token: visitorToken });
            expect(anon.status).toBe(401);
            expect(visitor.status).toBe(403);
            expectPrivate(anon);
            expectPrivate(visitor);
            if (method === "HEAD") expect(anon.body).toBeNull();
          }
        }
      }
      expect(mocks.opened).not.toHaveBeenCalled();
      expect(mocks.pathStat).not.toHaveBeenCalled();
      expect(mocks.wholeRead).not.toHaveBeenCalled();
    },
  );

  it("rechecks resource status and caller on each chunk with no shared authorization cache", async () => {
    resource.status = "DRAFT";
    expect((await request({ token: adminToken, range: "bytes=0-1" })).status).toBe(206);
    expect((await request({ token: visitorToken, range: "bytes=2-3" })).status).toBe(403);
    resource.status = "APPROVED";
    expect((await request({ range: "bytes=2-3" })).status).toBe(206);
    resource.status = "REJECTED";
    expect((await request({ range: "bytes=4-5" })).status).toBe(401);
    expect(mocks.findFirst).toHaveBeenCalledTimes(4);
    expect(mocks.opened).toHaveBeenCalledTimes(2);
  });

  it("HEAD sends complete full-file headers, ignores Range, and has no body", async () => {
    const get = await request();
    await get.arrayBuffer();
    const head = await request({ method: "HEAD", range: "bytes=1-2" });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect([...head.headers]).toEqual([...get.headers]);
    const handle = mocks.handles.at(-1)!;
    expect(handle.read).not.toHaveBeenCalled();
    expect(handle.fd).toBe(-1);
  });

  it("HEAD performs preview checks but never returns a body, including errors", async () => {
    const invalid = await request({ method: "HEAD", preview: "1" });
    expect(invalid.status).toBe(415);
    expect(invalid.body).toBeNull();
    await writeFile(path.join(directory, "sample.pdf"), "%PDF-1.7\nbody");
    const valid = await request({ method: "HEAD", preview: "1" });
    expect(valid.status).toBe(200);
    expect(valid.headers.get("Content-Type")).toBe("application/pdf");
    expect(valid.headers.get("Content-Length")).toBe("13");
    expect(valid.body).toBeNull();
    expect(mocks.handles.every((handle) => handle.fd === -1)).toBe(true);
  });

  it("rejects traversal before database access", async () => {
    const response = await request({ name: "../../secret.pdf" });
    expect(response.status).toBe(400);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.opened).not.toHaveBeenCalled();
  });

  it("returns no-store 404 for missing rows and ENOENT after authorization", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    const noRow = await request();
    expect(noRow.status).toBe(404);
    expect(mocks.opened).not.toHaveBeenCalled();
    const noFile = await request({ name: "missing.pdf" });
    expect(noFile.status).toBe(404);
    expectPrivate(noRow);
    expectPrivate(noFile);
  });
});

describe("descriptor ownership and backpressure", () => {
  it("aborting during JPEG inspection stops reads and closes the descriptor", async () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 1, 0, 1, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff,
      0xd9,
    ]);
    const app = Buffer.alloc(65537);
    app[0] = 0xff;
    app[1] = 0xe1;
    app.writeUInt16BE(65535, 2);
    await writeFile(
      path.join(directory, "aborted.jpg"),
      Buffer.concat([jpeg.subarray(0, 2), app, app, jpeg.subarray(2)]),
    );
    const controller = new AbortController();
    mocks.afterOpen = async (file) => {
      vi.mocked(file.read).mockRestore();
      const realRead = file.read.bind(file);
      vi.spyOn(file, "read").mockImplementationOnce(
        async (...args: Parameters<typeof realRead>) => {
          const result = await realRead(...args);
          controller.abort();
          return result;
        },
      );
    };
    const response = await request({
      name: "aborted.jpg",
      preview: "1",
      signal: controller.signal,
    });
    expect(response.status).toBe(499);
    expect(mocks.handles[0]?.read).toHaveBeenCalledTimes(1);
    expect(mocks.handles[0]?.fd).toBe(-1);
  });

  it("uses the already opened file for fstat and reads even when the path is replaced", async () => {
    mocks.afterOpen = async () => {
      await rename(path.join(directory, "sample.pdf"), path.join(directory, "original.pdf"));
      await writeFile(path.join(directory, "sample.pdf"), "replacement has a different size");
    };
    const response = await request();
    expect(await response.text()).toBe("0123456789");
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(mocks.pathStat).not.toHaveBeenCalled();
    expect(mocks.handles[0]?.fd).toBe(-1);
  });

  it("serves an unlinked opened file and closes it on completion", async () => {
    mocks.afterOpen = async () => {
      await rm(path.join(directory, "sample.pdf"));
    };
    const response = await request();
    expect(await response.text()).toBe("0123456789");
    expect(mocks.handles[0]?.fd).toBe(-1);
  });

  it("does not read ahead without demand; cancelling the stream closes the descriptor", async () => {
    await writeFile(path.join(directory, "sample.pdf"), Buffer.alloc(4 * 1024 * 1024, 7));
    const response = await request();
    const handle = mocks.handles[0]!;
    expect(handle).toBeDefined();
    expect(handle.read).not.toHaveBeenCalled();
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.value!.byteLength).toBeLessThanOrEqual(64 * 1024);
    const readCount = vi.mocked(handle.read).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(handle.read).toHaveBeenCalledTimes(readCount);
    await reader.cancel();
    expect(handle.fd).toBe(-1);
  });

  it("request abort closes a descriptor even when the consumer never starts reading", async () => {
    const controller = new AbortController();
    const response = await request({ signal: controller.signal });
    const handle = mocks.handles[0]!;
    expect(handle).toBeDefined();
    controller.abort();
    await expect.poll(() => handle.fd).toBe(-1);
    await expect(response.arrayBuffer()).rejects.toThrow();
  });

  it("closes the descriptor on a read error", async () => {
    const response = await request();
    const handle = mocks.handles[0]!;
    expect(handle).toBeDefined();
    vi.mocked(handle.read).mockRejectedValueOnce(new Error("simulated read failure"));
    await expect(response.arrayBuffer()).rejects.toThrow("simulated read failure");
    expect(handle.fd).toBe(-1);
  });

  it("closes the descriptor when fstat fails", async () => {
    mocks.afterOpen = async (handle) => {
      vi.mocked(handle.stat).mockRejectedValueOnce(new Error("simulated fstat failure"));
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await request();
      expect(response.status).toBe(500);
      expectPrivate(response);
      expect(mocks.handles[0]?.fd).toBe(-1);
    } finally {
      logged.mockRestore();
    }
  });
});
