import { test, expect, type Page } from "@playwright/test";

const id = "33333333-3333-4333-8333-333333333333";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7X8AAAAASUVORK5CYII=",
  "base64",
);

function samplePdf(large = false) {
  const streams = [
    "BT /F1 28 Tf 40 160 Td (First page) Tj ET",
    "BT /F1 28 Tf 40 160 Td (Second page) Tj ET",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 220] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 220] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...streams.map((s) => `<< /Length ${s.length} >>\nstream\n${s}\nendstream`),
  ];
  let body = "%PDF-1.7\n" + (large ? `%${" ".repeat(260_000)}\n` : "");
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

async function setup(page: Page, kind: "pdf" | "png" | "zip" = "pdf", failure = false) {
  const data =
    kind === "pdf"
      ? samplePdf()
      : kind === "png"
        ? Buffer.from(
            await page.evaluate(() => {
              const canvas = document.createElement("canvas");
              canvas.width = 1200;
              canvas.height = 900;
              const context = canvas.getContext("2d")!;
              context.fillStyle = "#eaf2ff";
              context.fillRect(0, 0, 1200, 900);
              context.fillStyle = "#1e40af";
              context.font = "bold 70px sans-serif";
              context.fillText("课程示意图", 100, 180);
              context.strokeStyle = "#60a5fa";
              context.lineWidth = 10;
              context.strokeRect(100, 260, 1000, 480);
              context.font = "40px sans-serif";
              context.fillText("图片预览 · 放大查看", 170, 530);
              return canvas.toDataURL("image/png").split(",")[1]!;
            }),
            "base64",
          )
        : png;
  let requests = 0;
  await page.addInitScript(() => localStorage.setItem("auth_access_token", "preview-test-token"));
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: { data: { id: "viewer", username: "阅读者", role: "VISITOR", avatar: null } },
    }),
  );
  await page.route("**/api/me/programs", (route) =>
    route.fulfill({ json: { data: [{ id: "program" }] } }),
  );
  await page.route(`**/api/resources/${id}`, (route) =>
    route.fulfill({
      json: {
        data: {
          id,
          title: "课程资料预览",
          type: "LECTURE_NOTE",
          summary: "这是一份用于验证在线阅读的课程资料。",
          url: null,
          filePath: `sample.${kind}`,
          fileName: `课程笔记.${kind}`,
          fileSize: data.length,
          status: "APPROVED",
          canEdit: false,
          submitterName: "同学",
          createdAt: "2026-09-06T00:00:00Z",
          courses: [],
        },
      },
    }),
  );
  await page.route(`**/api/files/sample.${kind}*`, (route) => {
    requests++;
    if (failure) return route.fulfill({ status: 404, json: { error: { message: "文件不存在" } } });
    return route.fulfill({
      status: 200,
      body: data,
      contentType: kind === "pdf" ? "application/pdf" : "image/png",
      headers: {
        "Content-Length": String(data.length),
        "Cache-Control": "no-store",
        "Accept-Ranges": "bytes",
      },
    });
  });
  await page.goto(`/resource/${id}`);
  await expect(page.getByRole("heading", { name: "课程资料预览" })).toBeVisible();
  return () => requests;
}

test("PDF opens on demand, changes pages, zooms and releases its dialog", async ({ page }) => {
  const requests = await setup(page);
  expect(requests()).toBe(0);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("当前页")).toHaveText("1 / 2");
  const canvas = dialog.locator("canvas");
  await expect(canvas).toBeVisible();
  const first = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const previousCanvas = await canvas.elementHandle();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByLabel("当前页")).toHaveText("2 / 2");
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(first);
  await expect
    .poll(() => previousCanvas!.evaluate((c: HTMLCanvasElement) => c.width * c.height))
    .toBe(0);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.getByLabel("缩放比例")).toHaveText("125%");
  await expect(page.getByRole("button", { name: "上一页", exact: true })).toBeEnabled();
  await page.screenshot({ path: "tmp/preview-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "预览", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByLabel("当前页")).toHaveText("1 / 2");
});

test("image fits a narrow viewport and can be enlarged", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, "png");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: "课程笔记.png" })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .getByRole("img", { name: "课程笔记.png" })
        .evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeLessThanOrEqual(390);
  await page.screenshot({ path: "tmp/preview-mobile.png" });
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.getByLabel("缩放比例")).toHaveText("125%");
  expect(
    await page.getByRole("dialog").evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "关闭预览" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("missing attachment has a clear error and retry action", async ({ page }) => {
  await setup(page, "pdf", true);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/文件不存在|找不到/);
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
});

test("unsupported files keep their download without a preview button", async ({ page }) => {
  await setup(page, "zip");
  await expect(page.getByRole("button", { name: "预览", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /下载/ })).toBeVisible();
});

test("closing during a slow request prevents late content from returning", async ({ page }) => {
  await setup(page, "png");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("**/api/files/sample.png*", async (route) => {
    requested = true;
    await gate;
    await route.fulfill({ body: png, contentType: "image/png" }).catch(() => {});
  });
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole("button", { name: "关闭预览" }).click();
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "课程笔记.png" })).toHaveCount(0);
});

test("changing login in another tab closes and clears an open preview", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByLabel("当前页")).toHaveText("1 / 2");
  await page.evaluate(() => {
    localStorage.removeItem("auth_access_token");
    window.dispatchEvent(new StorageEvent("storage", { key: "auth_access_token", newValue: null }));
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("worker failure offers recovery without silently falling back", async ({ page }) => {
  await setup(page);
  await page.route("**/pdfjs/**/pdf.worker.min.mjs", (route) => route.abort());
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/预览.*失败/);
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
});

test("large PDF uses byte ranges with authorization on every request", async ({ page }) => {
  await setup(page);
  const data = samplePdf(true);
  const requests: { range?: string; auth?: string }[] = [];
  await page.route("**/api/files/sample.pdf*", (route) => {
    const headers = route.request().headers();
    requests.push({ range: headers.range, auth: headers.authorization });
    const match = headers.range?.match(/^bytes=(\d+)-(\d+)$/);
    const start = match ? Number(match[1]) : 0;
    const end = match ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
    return route.fulfill({
      status: match ? 206 : 200,
      body: data.subarray(start, end + 1),
      contentType: "application/pdf",
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Cache-Control": "private, no-store",
        ...(match ? { "Content-Range": `bytes ${start}-${end}/${data.length}` } : {}),
      },
    });
  });
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByLabel("当前页")).toHaveText("1 / 2");
  await expect(page.getByRole("button", { name: "下一页", exact: true })).toBeEnabled();
  expect(requests.some((request) => request.range)).toBe(true);
  expect(requests.every((request) => request.auth === "Bearer preview-test-token")).toBe(true);
});

test("a worker crash after opening shows an error and releases the canvas", async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const workers: Worker[] = [];
    Object.assign(window, { previewWorkers: workers });
    window.Worker = class extends OriginalWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        workers.push(this);
      }
    };
  });
  await setup(page);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("button", { name: "下一页", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const workers = (window as unknown as { previewWorkers: Worker[] }).previewWorkers;
    workers[workers.length - 1]!.dispatchEvent(new Event("error"));
  });
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("预览组件加载失败");
  await expect(page.locator("canvas")).toHaveCount(0);
});
