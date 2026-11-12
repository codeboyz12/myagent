import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

test("synthetic account creates a backend session and reads persisted usage analytics", async ({ page }) => {
  test.setTimeout(150_000);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/model-settings", async (route) => {
    await route.fulfill({
      json: {
        configured: true,
        base_url: "http://127.0.0.1/e2e",
        model_id: "e2e-model",
        reasoning_effort: "default",
        api_key_configured: true,
        active_provider_id: "e2e-provider",
        model_controls: [],
        model_control_selections: {},
      },
    });
  });
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(`usage-${unique}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-audit-password");
  await page.getByLabel("Confirm password").fill("synthetic-audit-password");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/chat$/);

  // This integration test verifies persistence and analytics, not live MCP
  // discovery. Keep the synthetic chat independent of npx/SearXNG startup.
  const disableBuiltinMcp = await page.evaluate(async () => {
    const response = await fetch("/api/mcp-servers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ builtin_enabled: false, servers: [] }),
    });
    return response.status;
  });
  expect(disableBuiltinMcp).toBe(200);

  await page.getByPlaceholder("What’s on your mind?").fill("Create a synthetic usage event.");
  const chatResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/chat" &&
    response.request().method() === "POST" && response.status() === 200,
  );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);
  await chatResponse;
  await expect(page.getByText("Synthetic backend response.")).toBeVisible();

  const analyticsResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/usage/analytics",
  );
  await page.goto("/usage");
  const analytics = await analyticsResponse;
  expect(analytics.status(), await analytics.text()).toBe(200);
  const data = await analytics.json();
  expect(data.overview.totalMessages).toBe(2);
  expect(data.overview.userMessages).toBe(1);
  expect(data.overview.assistantMessages).toBe(1);
  expect(data.overview.totalChats).toBe(1);
  expect(data.overview.totalTokens).toBe(18);
  expect(data.models).toEqual(expect.arrayContaining([
    expect.objectContaining({
      providerId: "local",
      modelId: "e2e-model",
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
    }),
  ]));
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();

  const timezoneResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/usage/analytics" &&
    new URL(response.url()).searchParams.get("timezone") === "UTC" && response.status() === 200,
  );
  await page.locator('select[name="timezone"]').selectOption("UTC");
  await timezoneResponse;

  const weekly = page.getByRole("button", { name: "Weekly" });
  await weekly.click();
  await expect(weekly).toHaveAttribute("aria-pressed", "true");

  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    const documentWidth = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(documentWidth, `document overflow at ${viewport.width}px`).toBe(0);
    if (viewport.width === 375 || viewport.width === 1440) {
      const view = viewport.width === 375 ? "mobile" : "desktop";
      const devIndicatorStyle = await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });
      await page.screenshot({
        path: resolve(`../docs/openui-ux-usage-populated-${view}-after.png`),
        fullPage: true,
      });
      await devIndicatorStyle.evaluate((element) => element.parentNode?.removeChild(element));
    }
  }

  const accessibility = await page.evaluate(async () => {
    const axe = Reflect.get(window, "axe") as {
      run: (context: Document) => Promise<{ violations: { id: string }[] }>;
    };
    return (await axe.run(document)).violations;
  });
  expect(accessibility).toEqual([]);
});
