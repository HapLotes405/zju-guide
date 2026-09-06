import { test, expect, type Page } from "@playwright/test";

const bannerText = "第一次使用求是学径？";
const steps = ["1 选择培养方案", "2 认识仪表盘", "3 查看课程与资料", "4 分享学习资源"] as const;

// Keep the real application/router/storage behavior. Only the API is replaced;
// an unrecognized request fails locally instead of reaching a real database.
async function mockNewUser(page: Page) {
  const unexpected: string[] = [];
  await page.addInitScript(() => {
    if (!localStorage.getItem("auth_access_token")) {
      localStorage.setItem("auth_access_token", "guide-user-alice");
    }
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/auth/me") {
      const token = request.headers().authorization?.replace(/^Bearer /, "");
      if (token === "guide-user-alice" || token === "guide-user-bob") {
        return route.fulfill({
          json: {
            data: {
              id: token,
              username: token === "guide-user-alice" ? "引导用户甲" : "引导用户乙",
              role: "VISITOR",
              avatar: null,
              createdAt: "2026-09-06T00:00:00Z",
              updatedAt: "2026-09-06T00:00:00Z",
            },
          },
        });
      }
    }
    if (request.method() === "GET" && pathname === "/api/me/programs") {
      return route.fulfill({ json: { data: [] } });
    }
    if (request.method() === "GET" && pathname === "/api/programs") {
      return route.fulfill({
        json: {
          data: {
            years: [{ year: 2026, majors: ["材料科学与工程"] }],
            options: [
              { id: "guide-program", majorName: "材料科学与工程", year: 2026, totalCredits: 160 },
            ],
            total: 1,
          },
        },
      });
    }
    unexpected.push(`${request.method()} ${pathname}`);
    return route.fulfill({
      status: 501,
      json: { error: { code: "UNMOCKED_API", message: "测试未配置此接口" } },
    });
  });
  return {
    unexpected,
    async switchUser(user: "alice" | "bob") {
      // Use the same browser context and retain dismissal records while changing
      // the authenticated account. An init script must not overwrite this token.
      await page.evaluate(
        (value) => localStorage.setItem("auth_access_token", value),
        `guide-user-${user}`,
      );
      await page.reload();
      await onboardingReady(page);
    },
  };
}

async function onboardingReady(page: Page) {
  await expect(page).toHaveURL(/\/onboarding(?:[?#]|$)/);
  await expect(page.getByRole("heading", { name: "欢迎来到求是学径", exact: true })).toBeVisible();
  // This confirms both authentication and the program catalog finished loading
  // before a negative banner assertion can pass.
  await expect(page.getByRole("button", { name: "2026 级", exact: true })).toBeVisible();
}

async function guideReady(page: Page) {
  await expect(
    page.getByRole("heading", { name: "新手引导", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/guide(?:[?#]|$)/);
}

test("new users without a program can open and reload the guide without an onboarding redirect", async ({
  page,
}) => {
  const session = await mockNewUser(page);
  await page.goto("/guide");
  await guideReady(page);
  await expect(page.getByRole("button", { name: steps[0], exact: true })).toBeVisible();
  await page.reload();
  await guideReady(page);
  expect(session.unexpected).toEqual([]);
});

test("four accessible steps switch content and explain PDF preview with working destination links", async ({
  page,
}) => {
  const session = await mockNewUser(page);
  await page.goto("/guide");
  await guideReady(page);
  for (const name of steps)
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: steps[1], exact: true }).click();
  await expect(page.getByRole("heading", { name: "认识仪表盘", exact: true })).toBeVisible();
  await page.getByRole("button", { name: steps[2], exact: true }).click();
  await expect(page.getByRole("heading", { name: "查看课程与资料", exact: true })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main).toContainText("PDF");
  await expect(main).toContainText("预览");
  await expect(
    main.getByText(
      "浏览学习资料、投稿和查看投稿前，需要先选择培养方案；相关入口会先带你完成选择。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(main.locator('a[href="/courses"]')).toBeVisible();
  await expect(main.locator('a[href="/resources"]')).toBeVisible();
  await expect(page).toHaveURL(/\/guide(?:[?#]|$)/);
  await page.screenshot({ path: "tmp/guide-desktop.png", fullPage: true });
  expect(session.unexpected).toEqual([]);
});

test("the final step starts using the app through the home link", async ({ page }) => {
  const session = await mockNewUser(page);
  await page.goto("/guide");
  await guideReady(page);
  await page.getByRole("button", { name: steps[3], exact: true }).click();
  await expect(page.getByRole("heading", { name: "分享学习资源", exact: true })).toBeVisible();
  const start = page.getByRole("link", { name: "开始使用", exact: true });
  await expect(start).toHaveAttribute("href", "/");
  await start.click();
  // A new user still needs to choose a program after leaving the guide.
  await onboardingReady(page);
  await expect(page.getByText(bannerText, { exact: true })).toBeHidden();
  expect(session.unexpected).toEqual([]);
});

test("keyboard navigation into the final step moves focus to its heading", async ({ page }) => {
  const session = await mockNewUser(page);
  await page.goto("/guide");
  await guideReady(page);
  await page.getByRole("button", { name: steps[2], exact: true }).click();
  const next = page.getByRole("button", { name: "下一步", exact: true });
  await next.focus();
  await expect(next).toBeFocused();
  await next.press("Enter");
  await expect(
    page.getByRole("heading", { name: "分享学习资源", exact: true, level: 2 }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "开始使用", exact: true })).toBeVisible();
  expect(session.unexpected).toEqual([]);
});

test("all guide steps fit a 390px mobile viewport without horizontal overflow", async ({
  page,
}) => {
  const session = await mockNewUser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide");
  await guideReady(page);
  for (const name of steps) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: name.slice(2), exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
            window.innerWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
  }
  await expect(page.getByRole("link", { name: "开始使用", exact: true })).toBeVisible();
  await page.screenshot({ path: "tmp/mobile.png", fullPage: true });
  expect(session.unexpected).toEqual([]);
});

test("skipping the first-entry banner survives a reload for the same user", async ({ page }) => {
  const session = await mockNewUser(page);
  await page.goto("/onboarding");
  await onboardingReady(page);
  const banner = page.getByText(bannerText, { exact: true });
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: "暂时跳过", exact: true }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await onboardingReady(page);
  await expect(banner).toBeHidden();
  expect(session.unexpected).toEqual([]);
});

test("banner dismissal is isolated between accounts using the same browser storage", async ({
  page,
}) => {
  const session = await mockNewUser(page);
  await page.goto("/onboarding");
  await onboardingReady(page);
  const banner = page.getByText(bannerText, { exact: true });
  await expect(banner).toBeVisible();
  await page.getByRole("button", { name: "暂时跳过", exact: true }).click();
  await expect(banner).toBeHidden();
  await session.switchUser("bob");
  await expect(banner).toBeVisible();
  await session.switchUser("alice");
  await expect(banner).toBeHidden();
  await session.switchUser("bob");
  await expect(banner).toBeVisible();
  expect(session.unexpected).toEqual([]);
});

test("opening the guide from navigation marks it viewed only for that user", async ({ page }) => {
  const session = await mockNewUser(page);
  await page.goto("/onboarding");
  await onboardingReady(page);
  const banner = page.getByText(bannerText, { exact: true });
  await expect(banner).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "新手引导", exact: true }).click();
  await guideReady(page);
  // Visiting is sufficient: no skip or completion action is used here.
  await page.goto("/onboarding");
  await onboardingReady(page);
  await expect(banner).toBeHidden();
  await page.reload();
  await onboardingReady(page);
  await expect(banner).toBeHidden();
  await session.switchUser("bob");
  await expect(banner).toBeVisible();
  expect(session.unexpected).toEqual([]);
});
