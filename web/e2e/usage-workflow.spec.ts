import { expect, test } from "@playwright/test";

test("usage filters refresh analytics and aggregation controls stay selectable", async ({ page }) => {
  const requests: URLSearchParams[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const priorDayDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    if (url.pathname === "/api/usage/analytics") {
      requests.push(url.searchParams);
      const from = url.searchParams.get("from") ?? priorDayDate;
      const to = url.searchParams.get("to") ?? today;
      await route.fulfill({
        json: {
          from,
          to,
          timezone: url.searchParams.get("timezone") ?? "UTC",
          overview: {
            totalTokens: 12,
            highestDailyTokens: 8,
            highestDailyComplete: true,
            longestActiveSessionMs: 60_000,
            currentStreak: 2,
            longestStreak: 2,
            activeDays: 2,
            totalChats: 2,
            totalMessages: 4,
            userMessages: 2,
            assistantMessages: 2,
          },
          tokenCoverage: { knownInvocations: 2, invocations: 2, complete: true },
          messageCoverage: { complete: true },
          daily: [priorDayDate, today].map((date, index) => ({
            date,
            tokens: index ? 4 : 8,
            knownTokens: index ? 4 : 8,
            invocations: 1,
            chats: 1,
            messages: 2,
            messagesComplete: true,
            active: true,
            complete: true,
          })),
          models: [{
            providerId: "audit-provider",
            modelId: "audit-model",
            modelName: "Audit model",
            source: "oauth",
            messageCount: 4,
            turnCount: 2,
            invocationCount: 2,
            inputTokens: 8,
            outputTokens: 4,
            totalTokens: 12,
            tokenCoverage: 1,
          }],
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/usage");
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
  await expect(page.getByText("12", { exact: true }).first()).toBeVisible();

  await page.locator("#usage-provider").selectOption("audit-provider");
  await page.locator("#usage-model").selectOption("audit-model");
  await page.locator("#usage-source").selectOption("oauth");
  await page.locator("#usage-from").fill(priorDayDate);
  await page.locator("#usage-to").fill(today);
  await expect.poll(() => requests.some((query) =>
    query.get("provider") === "audit-provider" &&
    query.get("model") === "audit-model" &&
    query.get("source") === "oauth" &&
    query.get("from") === priorDayDate &&
    query.get("to") === today,
  )).toBe(true);

  const weekly = page.getByRole("button", { name: "Weekly", exact: true });
  const cumulative = page.getByRole("button", { name: "Cumulative", exact: true });
  await weekly.click();
  await expect(weekly).toHaveAttribute("aria-pressed", "true");
  await cumulative.click();
  await expect(cumulative).toHaveAttribute("aria-pressed", "true");

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Daily" }).click();
    const day = page.getByRole("button", { name: /\d{4}-\d{2}-\d{2}.*tokens/ }).first();
    await day.focus();
    await page.keyboard.press("Enter");
    await expect(day).toHaveAttribute("aria-pressed", "true");
    const closeDetail = page.getByRole("button", { name: "Close day details" });
    await closeDetail.focus();
    await page.keyboard.press("Enter");
    await expect(closeDetail).toHaveCount(0);

    await weekly.focus();
    await page.keyboard.press("Tab");
    await expect(cumulative).toBeFocused();
    await page.keyboard.press("Space");
    await expect(cumulative).toHaveAttribute("aria-pressed", "true");
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(widths.document).toBe(widths.viewport);
  }
});
