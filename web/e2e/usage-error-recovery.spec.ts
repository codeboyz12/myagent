import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

test("Usage exposes loading and error states, then recovers on retry", async ({ page }) => {
  let releaseFirstRequest!: () => void;
  const createRequestGate = () => new Promise<void>((resolve) => { releaseFirstRequest = resolve; });
  let firstRequestGate = createRequestGate();
  let failNextRequest = true;
  let analyticsCalls = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    if (url.pathname === "/api/usage/analytics") {
      analyticsCalls += 1;
      if (failNextRequest) {
        failNextRequest = false;
        await firstRequestGate;
        await route.fulfill({ status: 503, json: { detail: "Service unavailable" } });
        return;
      }
      await route.fulfill({
        json: {
          from: "2026-01-01",
          to: "2026-01-02",
          timezone: "UTC",
          overview: {
            totalTokens: 0,
            highestDailyTokens: 0,
            highestDailyComplete: true,
            longestActiveSessionMs: null,
            currentStreak: 0,
            longestStreak: 0,
            activeDays: 0,
            totalChats: 0,
            totalMessages: 0,
            userMessages: 0,
            assistantMessages: 0,
          },
          tokenCoverage: { knownInvocations: 0, invocations: 0, complete: true },
          messageCoverage: { complete: true },
          daily: [],
          models: [],
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/usage");
  await expect(page.getByLabel("Loading usage data")).toBeVisible();
  releaseFirstRequest();

  const error = page.getByRole("alert").filter({ hasText: "Could not load usage data." });
  await expect(error).toContainText("Could not load usage data.");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  const axeSource = await readFile(resolve("node_modules/axe-core/axe.js"), "utf8");
  await page.addScriptTag({ content: axeSource });
  const assertNoAxeViolations = async () => {
    const violations = await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const axe = Reflect.get(window, "axe") as {
        run: (context: Document) => Promise<{ violations: { id: string }[] }>;
      };
      return (await axe.run(document)).violations;
    });
    expect(violations).toEqual([]);
  };
  const assertBothThemes = async () => {
    await assertNoAxeViolations();
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      document.documentElement.dataset.openuiTheme = "dark";
    });
    await assertNoAxeViolations();
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      delete document.documentElement.dataset.openuiTheme;
    });
    await assertNoAxeViolations();
  };
  const assertNoHorizontalOverflow = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  };
  await assertNoAxeViolations();
  await assertNoHorizontalOverflow();

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("region", { name: "Usage summary" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Usage summary" }).getByText("0", { exact: true }).first(),
  ).toBeVisible();
  await expect.poll(() => analyticsCalls).toBe(2);
  await assertNoAxeViolations();
  await assertNoHorizontalOverflow();

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    failNextRequest = true;
    firstRequestGate = createRequestGate();
    await page.reload();
    await expect(page.getByLabel("Loading usage data")).toBeVisible();
    await assertNoHorizontalOverflow();
    await page.addScriptTag({ content: axeSource });
    await assertBothThemes();
    releaseFirstRequest();
    await expect(page.getByRole("alert").filter({ hasText: "Could not load usage data." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await assertBothThemes();
    await assertNoHorizontalOverflow();

    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("region", { name: "Usage summary" })).toBeVisible();
    await assertBothThemes();
    await assertNoHorizontalOverflow();
  }
});
