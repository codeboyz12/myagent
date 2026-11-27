import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expectDialogResponsiveAndAccessible } from "./a11y-viewport";

test("provider removal confirmation is keyboard-dismissible and does not delete on cancel", async ({ page }) => {
  let deleteRequests = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/model-settings") {
      await route.fulfill({
        json: {
          configured: true,
          base_url: "https://api.audit.invalid/v1",
          model_id: "audit-model",
          reasoning_effort: "default",
          api_key_configured: true,
          active_provider_id: "audit-provider",
          model_controls: [],
          model_control_selections: {},
        },
      });
      return;
    }
    if (url.pathname === "/api/model-providers" && route.request().method() === "GET") {
      await route.fulfill({
        json: {
          active_provider_id: "audit-provider",
          providers: [{
            id: "audit-provider",
            name: "Audit provider",
            base_url: "https://api.audit.invalid/v1",
            model_id: "audit-model",
            reasoning_effort: "default",
            enabled: true,
            api_key_configured: true,
            model_controls: {},
            model_control_selections: {},
            models: [{ id: "audit-model", name: "Audit model" }],
          }],
        },
      });
      return;
    }
    if (url.pathname === "/api/chatgpt-plan") {
      await route.fulfill({
        json: {
          connected: false,
          email: null,
          provider_id: null,
          enabled: false,
          manage_usage_url: "https://chatgpt.com/settings/usage",
        },
      });
      return;
    }
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    if (route.request().method() === "DELETE") deleteRequests += 1;
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings");
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  const expectNoAxeViolations = async () => {
    const violations = await page.evaluate(async () => {
      await Promise.all(
        [...document.querySelectorAll("[role=alertdialog]")]
          .flatMap((element) => element.getAnimations())
          .map((animation) => animation.finished.catch(() => undefined)),
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const axe = Reflect.get(window, "axe") as {
        run: (context: Document) => Promise<{ violations: Array<{ id: string; help: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> }>;
      };
      return (await axe.run(document)).violations.map(({ id, help, nodes }) => ({
        id,
        help,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      }));
    });
    expect(violations).toEqual([]);
  };
  await expect(page.getByRole("heading", { name: "OpenAI-compatible API" })).toBeVisible();
  const removeButton = page.getByRole("button", { name: "Remove", exact: true });
  await expect(removeButton).toBeVisible();
  await removeButton.focus();
  await page.keyboard.press("Enter");

  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("heading", { name: "Remove this connection?" })).toBeVisible();
  await expectNoAxeViolations();
  await expectDialogResponsiveAndAccessible(page, confirmation);
  await page.keyboard.press("Escape");

  await expect(confirmation).toBeHidden();
  await expect(removeButton).toBeFocused();
  expect(deleteRequests).toBe(0);
});
