import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectDialogResponsiveAndAccessible, waitForVisualSettling } from "./a11y-viewport";

async function tabUntilFocused(page: Page, target: Locator) {
  for (let index = 0; index < 16; index += 1) {
    if (await target.evaluate((element) => document.activeElement === element)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("The target control was not reachable with Tab.");
}

test("provider model discovery recovers from an error and saves the selected model", async ({ page }) => {
  let discoveryRequests = 0;
  let failNextDiscovery = true;
  let savedPayload: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/model-settings") {
      await route.fulfill({ json: {
        configured: false,
        base_url: "",
        model_id: "",
        reasoning_effort: "default",
        api_key_configured: false,
        active_provider_id: null,
        model_controls: [],
        model_control_selections: {},
      } });
      return;
    }
    if (url.pathname === "/api/model-providers" && route.request().method() === "GET") {
      await route.fulfill({ json: { active_provider_id: null, providers: [] } });
      return;
    }
    if (url.pathname === "/api/chatgpt-plan") {
      await route.fulfill({ json: { connected: false, email: null, provider_id: null, enabled: false, manage_usage_url: "https://chatgpt.com/settings/usage" } });
      return;
    }
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    if (url.pathname === "/api/model-settings/discover" && route.request().method() === "POST") {
      discoveryRequests += 1;
      if (failNextDiscovery) {
        failNextDiscovery = false;
        await route.fulfill({ status: 502, json: { detail: "Could not connect to that endpoint." } });
      } else {
        await route.fulfill({ json: { models: [
          { id: "audit-small", name: "Audit Small" },
          { id: "audit-long", name: "Audit Long Context Model".repeat(5), alias: "A very long model alias for wrapping checks".repeat(2) },
        ] } });
      }
      return;
    }
    if (url.pathname === "/api/model-providers" && route.request().method() === "POST") {
      savedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, json: { id: "saved-provider" } });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings");
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  const expectNoAxeViolations = async () => {
    const violations = await page.evaluate(async () => {
      await Promise.all(
        [...document.querySelectorAll('[role="dialog"]')]
          .flatMap((element) => element.getAnimations())
          .map((animation) => animation.finished.catch(() => undefined)),
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const axe = Reflect.get(window, "axe") as {
        run: (context: Document) => Promise<{ violations: Array<{ id: string; help: string; nodes: Array<{ target: string[]; html: string; failureSummary?: string }> }> }>;
      };
      return (await axe.run(document)).violations.map(({ id, help, nodes }) => ({ id, help, nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })) }));
    });
    expect(violations).toEqual([]);
  };
  const addConnection = page.getByRole("button", { name: "Add connection" });
  await addConnection.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save connection" })).toBeDisabled();

  const apiKey = dialog.getByLabel("API key");
  await tabUntilFocused(page, apiKey);
  expect(await apiKey.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await apiKey.fill("synthetic-test-key");
  const loadModels = dialog.getByRole("button", { name: "Load models" });
  await tabUntilFocused(page, loadModels);
  expect(await loadModels.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("Could not connect to that endpoint.");
  await expect(dialog.getByRole("button", { name: "Save connection" })).toBeDisabled();
  await expectNoAxeViolations();
  await expectDialogResponsiveAndAccessible(page, dialog);
  await page.setViewportSize({ width: 375, height: 812 });
  await waitForVisualSettling(page);

  await tabUntilFocused(page, loadModels);
  expect(await loadModels.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  const model = dialog.getByLabel("Model");
  await expect(model).toBeVisible();
  await expect(model).toHaveValue("audit-small");
  await page.keyboard.press("Tab");
  await expect(model).toBeFocused();
  expect(await model.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await model.selectOption("audit-long");
  await expect(model).toHaveValue("audit-long");
  await expectDialogResponsiveAndAccessible(page, dialog);
  await page.setViewportSize({ width: 375, height: 812 });
  await waitForVisualSettling(page);
  await expect(dialog.getByRole("button", { name: "Save connection" })).toBeEnabled();
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(375);

  const saveConnection = dialog.getByRole("button", { name: "Save connection" });
  await tabUntilFocused(page, saveConnection);
  expect(await saveConnection.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  expect(discoveryRequests).toBe(2);
  expect(savedPayload).toMatchObject({ model_id: "audit-long", api_key: "synthetic-test-key" });

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    failNextDiscovery = true;
    await page.getByRole("button", { name: "Add connection" }).click();
    const retryDialog = page.getByRole("dialog");
    await expect(retryDialog).toBeVisible();
    await retryDialog.getByLabel("API key").fill("synthetic-retry-key");
    await retryDialog.getByRole("button", { name: "Load models" }).click();
    await expect(retryDialog.getByRole("alert")).toContainText("Could not connect to that endpoint.");
    await expect(retryDialog.getByRole("button", { name: "Save connection" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectNoAxeViolations();

    await retryDialog.getByRole("button", { name: "Load models" }).click();
    await expect(retryDialog.getByLabel("Model")).toBeVisible();
    await expect(retryDialog.getByLabel("Model")).toHaveValue("audit-small");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectNoAxeViolations();
    const retryBounds = await retryDialog.boundingBox();
    expect(retryBounds).not.toBeNull();
    expect(retryBounds!.x).toBeGreaterThanOrEqual(0);
    expect(retryBounds!.x + retryBounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Escape");
    await expect(retryDialog).toBeHidden();
  }
});
