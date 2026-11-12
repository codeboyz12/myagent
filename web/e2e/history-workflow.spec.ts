import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expectDialogResponsiveAndAccessible } from "./a11y-viewport";

test("history actions rename a synthetic chat and confirm deletion", async ({ page }) => {
  const session = {
    session_id: "44e7a17e-f1d3-4b0d-a67b-98463eb2da41",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_turn_status: null as string | null,
    title: "Synthetic history item" as string | null,
  };
  let deleteRequests = 0;
  let renameRequests = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/sessions" && method === "GET") {
      await route.fulfill({ json: { sessions: session.title ? [session] : [] } });
      return;
    }
    if (url.pathname === `/api/sessions/${session.session_id}` && method === "PATCH") {
      renameRequests += 1;
      session.title = (await route.request().postDataJSON()).title;
      await route.fulfill({ json: session });
      return;
    }
    if (url.pathname === `/api/sessions/${session.session_id}` && method === "DELETE") {
      deleteRequests += 1;
      session.title = null;
      await route.fulfill({ status: 204 });
      return;
    }
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
    if (url.pathname === "/api/model-providers") {
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
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/chat");
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  const expectNoAxeViolations = async () => {
    const violations = await page.evaluate(async () => {
      await Promise.all(
        [...document.querySelectorAll("[role=menu], [role=dialog], [role=alertdialog]")]
          .flatMap((element) => element.getAnimations())
          .map((animation) => animation.finished.catch(() => undefined)),
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const axe = Reflect.get(window, "axe") as {
        run: (context: Document) => Promise<{ violations: Array<{ id: string; help: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> }>;
      };
      return (await axe.run(document)).violations.map((violation) => ({
        id: violation.id,
        help: violation.help,
        nodes: violation.nodes.map((node) => {
          const element = document.querySelector(node.target[0]);
          return {
            target: node.target,
            failureSummary: node.failureSummary,
            html: element?.outerHTML,
            color: element ? getComputedStyle(element).color : undefined,
            background: element ? getComputedStyle(element).backgroundColor : undefined,
          };
        }),
      }));
    });
    expect(violations).toEqual([]);
  };
  await expect(page.getByRole("link", { name: "Synthetic history item" })).toBeVisible();

  const conversationActions = page.getByRole("button", { name: "Conversation actions" });
  await conversationActions.focus();
  expect(await conversationActions.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  const renameItem = page.getByRole("menuitem", { name: "Rename" });
  const deleteItem = page.getByRole("menuitem", { name: "Delete" });
  await expect(renameItem).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(deleteItem).toBeFocused();
  await expectNoAxeViolations();
  await page.keyboard.press("ArrowUp");
  await expect(renameItem).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(renameItem).toBeHidden();
  await expect(conversationActions).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(renameItem).toBeFocused();
  await page.keyboard.press("Enter");
  const renameDialog = page.getByRole("dialog");
  await expect(renameDialog.getByRole("heading", { name: "Rename conversation" })).toBeVisible();
  await expectNoAxeViolations();
  await expectDialogResponsiveAndAccessible(page, renameDialog, [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const conversationName = renameDialog.getByLabel("Conversation name");
  await expect(conversationName).toBeFocused();
  expect(await conversationName.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await conversationName.fill("Cancelled rename");
  await page.keyboard.press("Escape");
  await expect(renameDialog).toBeHidden();
  expect(renameRequests).toBe(0);
  expect(session.title).toBe("Synthetic history item");
  await expect(conversationActions).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(renameItem).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(conversationName).toBeFocused();
  await conversationName.fill("Renamed audit chat");
  await page.keyboard.press("Tab");
  const renameCancel = renameDialog.getByRole("button", { name: "Cancel" });
  await expect(renameCancel).toBeFocused();
  await page.keyboard.press("Tab");
  const renameSave = renameDialog.getByRole("button", { name: "Save" });
  await expect(renameSave).toBeFocused();
  expect(await renameSave.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Renamed audit chat" })).toBeVisible();
  expect(renameRequests).toBe(1);

  const tourTrigger = page.getByRole("button", { name: "Tips & tour" });
  await tourTrigger.focus();
  await page.keyboard.press("Enter");
  const tourDialog = page.getByRole("dialog", { name: "Start with a message" });
  await expect(tourDialog.getByRole("heading", { name: "Start with a message" })).toBeVisible();
  await expectNoAxeViolations();
  await expectDialogResponsiveAndAccessible(page, tourDialog, [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const tourNext = tourDialog.getByRole("button", { name: "Next" });
  for (let index = 0; index < 8; index += 1) {
    if (await tourNext.evaluate((element) => document.activeElement === element)) break;
    await page.keyboard.press("Tab");
  }
  await expect(tourNext).toBeFocused();
  expect(await tourNext.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  const nextTourStep = page.getByRole("dialog", { name: "Choose your model" });
  await expect(nextTourStep.getByRole("heading", { name: "Choose your model" })).toBeVisible();
  await expect(nextTourStep.getByText("Tip 2 of 7")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nextTourStep).toBeHidden();
  await expect(tourTrigger).toBeFocused();

  await conversationActions.focus();
  await page.keyboard.press("Enter");
  await expect(renameItem).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(deleteItem).toBeFocused();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading", { name: "Delete this conversation?" })).toBeVisible();
  await expectNoAxeViolations();
  await expectDialogResponsiveAndAccessible(page, confirmation, [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  const deleteCancel = confirmation.getByRole("button", { name: "Cancel" });
  await expect(deleteCancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  expect(deleteRequests).toBe(0);
  await expect(conversationActions).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(renameItem).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const deleteConfirm = page.getByRole("alertdialog").getByRole("button", { name: "Delete conversation" });
  await deleteCancel.focus();
  await page.keyboard.press("Tab");
  await expect(deleteConfirm).toBeFocused();
  expect(await deleteConfirm.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Your conversations will appear here.")).toBeVisible();
  expect(deleteRequests).toBe(1);
});
