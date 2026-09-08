import { test, expect } from "@playwright/test";
// UI-only contract tests: intercepted API responses, no database mutation.
test("admin confirms candidate, submits, and withdraws a batch", async ({ page }) => {
  const candidate = {
    id: "candidate",
    title: "数据结构基础",
    url: "https://zju-turing.github.io/TuringCourses/major/data_structure/",
    summary: "来自图灵班学习指南的课程资料入口。",
    type: "BLOG",
    applicableStage: "COURSE",
    courseCodes: ["21100240"],
    courseLabels: { "21100240": "数据结构基础" },
    matchReason: "课程名称匹配",
    confirmed: false,
    status: "READY",
  };
  const job = {
    id: "batch",
    sourceId: "turing",
    status: "COMPLETED",
    scanned: 1,
    error: null,
    createdAt: "2026-09-08T15:00:00Z",
    candidates: [candidate],
  };
  await page.addInitScript(() => {
    localStorage.setItem("auth_access_token", "ui-test");
    localStorage.setItem("qiushi:guide:v1:admin", "seen");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/me") data = { id: "admin", username: "MVP 管理员", role: "ADMIN" };
    else if (path === "/api/me/programs") data = [{ id: "program" }];
    else if (path === "/api/admin/website-imports")
      data = {
        enabled: true,
        sources: [
          {
            id: "turing",
            name: "图灵班学习指南",
            baseUrl: "https://zju-turing.github.io/TuringCourses/",
          },
        ],
        jobs: [job],
      };
    else if (path === "/api/admin/website-imports/batch") {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        if (body.action === "update") Object.assign(candidate, { ...body, confirmed: true });
        if (body.action === "withdraw") job.status = "WITHDRAWN";
      }
      if (route.request().method() === "POST") {
        candidate.status = "SUBMITTED";
        data = {
          results: [{ candidateId: "candidate", status: "SUBMITTED", resourceId: "resource" }],
        };
      } else data = job;
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto("/contribute");
  await page.getByRole("tab", { name: "从网站导入" }).click();
  const selection = page.getByRole("checkbox", { name: "选择 数据结构基础" });
  await expect(selection).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "我已核对以上课程关联（自动建议不会直接用于投稿）" })
    .check();
  await page.getByRole("button", { name: "保存并确认" }).click();
  await expect(selection).toBeEnabled();
  await selection.check();
  await page.screenshot({ path: "output/website-import/admin-preview.png", fullPage: true });
  await page.getByRole("button", { name: "提交所选 / 重试失败项" }).click();
  await expect(page.getByText("已送审", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "撤回批次" }).click();
  await expect(page.getByRole("button", { name: "撤回批次" })).toHaveCount(0);
});
test("ordinary users only see manual contribution", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("auth_access_token", "visitor-ui-test"));
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json: {
        data:
          new URL(route.request().url()).pathname === "/api/auth/me"
            ? { id: "visitor", username: "同学", role: "VISITOR" }
            : [{ id: "program" }],
      },
    }),
  );
  await page.goto("/contribute");
  await expect(page.getByRole("heading", { name: "投稿资源" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "从网站导入" })).toHaveCount(0);
});
