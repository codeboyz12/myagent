import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { expectDialogResponsiveAndAccessible } from "./a11y-viewport";

test("Account deletion keeps its confirmation and offers recovery after a failed request", async ({ page }) => {
  let deleteAttempts = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
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
    if (url.pathname === "/api/model-providers" && method === "GET") {
      await route.fulfill({ json: { active_provider_id: null, providers: [] } });
      return;
    }
    if (url.pathname === "/api/chatgpt-plan") {
      await route.fulfill({ json: { connected: false, email: null, provider_id: null, enabled: false, manage_usage_url: "https://chatgpt.com/settings/usage" } });
      return;
    }
    if (url.pathname === "/api/sessions" && method === "GET") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    if (url.pathname === "/api/sessions" && method === "DELETE") {
      deleteAttempts += 1;
      if (deleteAttempts === 1) {
        await route.fulfill({ status: 503, json: { detail: "Could not delete your conversations." } });
      } else {
        await route.fulfill({ status: 204 });
      }
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.locator("h1", { hasText: /^Account$/ })).toBeVisible();
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  const axeViolations = () => page.evaluate(async () => {
    const axe = Reflect.get(window, "axe") as {
      run: (context: Document) => Promise<{ violations: Array<{ id: string }> }>;
    };
    return (await axe.run(document)).violations.map((violation) => violation.id);
  });

  await page.getByRole("button", { name: "Delete all", exact: true }).click();
  const confirmation = page.getByRole("group", { name: "Delete all conversations confirmation" });
  await expect(confirmation).toBeVisible();
  await expectDialogResponsiveAndAccessible(page, confirmation, undefined, "document");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await axeViolations()).toEqual([]);
  await confirmation.getByRole("button", { name: "Delete all", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not delete your conversations." })).toBeVisible();
  await expect(confirmation).toBeVisible();
  await expectDialogResponsiveAndAccessible(page, confirmation, undefined, "document");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await axeViolations()).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(200);
  expect(await axeViolations()).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.getByRole("button", { name: "Retry delete all conversations" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  expect(deleteAttempts).toBe(2);
});
