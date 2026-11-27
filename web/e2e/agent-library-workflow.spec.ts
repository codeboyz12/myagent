import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expectDialogResponsiveAndAccessible } from "./a11y-viewport";

async function tabUntilFocused(page: Page, target: Locator) {
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error("The target control was not reachable with Tab.");
}

test("Plugin settings persist synthetic Skills and Personas with confirmed removal", async ({ page }) => {
  type LibraryItem = {
    id: string;
    name: string;
    description: string;
    content: string;
    enabled: boolean;
    built_in: boolean;
  };
  let library: { skills: LibraryItem[]; personas: LibraryItem[] } = {
    skills: [{
      id: "audit-built-in",
      name: "Audit built-in",
      description: "Synthetic built-in skill",
      content: "Synthetic instructions",
      enabled: true,
      built_in: true,
    }],
    personas: [],
  };
  let saves = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    if (url.pathname === "/api/model-settings") {
      await route.fulfill({
        json: {
          configured: false,
          base_url: "",
          model_id: "",
          reasoning_effort: "default",
          api_key_configured: false,
          active_provider_id: null,
          model_controls: [],
          model_control_selections: {},
        },
      });
      return;
    }
    if (url.pathname === "/api/model-providers") {
      await route.fulfill({ json: { active_provider_id: null, providers: [] } });
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
    if (url.pathname === "/api/agent-library" && route.request().method() === "GET") {
      await route.fulfill({ json: library });
      return;
    }
    if (url.pathname === "/api/agent-library" && route.request().method() === "PUT") {
      library = await route.request().postDataJSON();
      saves += 1;
      await route.fulfill({ json: library });
      return;
    }
    if (url.pathname === "/api/mcp-servers" && route.request().method() === "GET") {
      await route.fulfill({ json: {
        builtin: { id: "searxng", name: "SearXNG Web Search", transport: "stdio", url: "http://127.0.0.1:8080", enabled: true, built_in: true, description: "Synthetic MCP fixture." },
        servers: [],
      } });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/settings");
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  await page.getByRole("button", { name: "Plugin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plugin", exact: true })).toBeVisible();
  await expect(page.getByText("Audit built-in")).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.mouse.move(740, 950);
  await page.screenshot({ path: resolve("../docs/openui-ux-plugin-skills-tablet-after.png"), fullPage: true });

  const agentSettingsTabs = page.getByRole("tablist", { name: "Agent settings" });
  const pluginTab = agentSettingsTabs.getByRole("tab", { name: "Plugin" });
  const mcpTab = agentSettingsTabs.getByRole("tab", { name: "MCP servers" });
  await expect(pluginTab).toHaveAttribute("aria-controls", "agent-settings-panel");
  await expect(page.locator("#agent-settings-panel")).toHaveAttribute("aria-labelledby", "agent-plugin-tab");
  await pluginTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(mcpTab).toBeFocused();
  await expect(mcpTab).toHaveAttribute("aria-selected", "true");
  await expect(mcpTab).toHaveAttribute("tabindex", "0");
  await expect(page.getByRole("heading", { name: "MCP servers" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(pluginTab).toBeFocused();
  await expect(pluginTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Audit built-in")).toBeVisible();

  const libraryTabs = page.getByRole("tablist", { name: "Agent library type" });
  const skillsTab = libraryTabs.getByRole("tab", { name: /Skills/ });
  const personaTab = libraryTabs.getByRole("tab", { name: /Persona/ });
  await expect(skillsTab).toHaveAttribute("aria-controls", "library-items-panel");
  await expect(page.locator("#library-items-panel")).toHaveAttribute("aria-labelledby", "library-skills-tab");
  await skillsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(personaTab).toBeFocused();
  await expect(personaTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(skillsTab).toBeFocused();
  await expect(skillsTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(personaTab).toBeFocused();
  await page.keyboard.press("Home");
  await expect(skillsTab).toBeFocused();
  await personaTab.click();
  await page.mouse.move(740, 950);
  await page.screenshot({ path: resolve("../docs/openui-ux-plugin-persona-tablet-after.png"), fullPage: true });
  await skillsTab.click();

  await page.getByRole("button", { name: /Add skill/ }).click();
  const skillDialog = page.getByRole("heading", { name: "Add skill" }).locator("xpath=..");
  await expectDialogResponsiveAndAccessible(page, skillDialog, undefined, "document");
  await page.setViewportSize({ width: 768, height: 1024 });
  const skillName = page.getByLabel("Name");
  const skillDescription = page.getByLabel("Description");
  const skillInstructions = page.getByLabel("Instructions");
  const skillSave = page.getByRole("button", { name: "Save", exact: true });
  await expect(skillName).toHaveAttribute("maxlength", "80");
  await expect(skillDescription).toHaveAttribute("maxlength", "500");
  await expect(skillInstructions).toHaveAttribute("maxlength", "20000");
  await expect(skillSave).toBeDisabled();
  await expect(skillName).toHaveAttribute("required", "");
  await expect(skillInstructions).toHaveAttribute("required", "");
  expect(await skillName.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  expect(await skillInstructions.evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
  await skillName.fill("Name only");
  await expect(skillSave).toBeDisabled();
  expect(await skillName.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
  expect(await skillInstructions.evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
  await skillName.fill("");
  await tabUntilFocused(page, skillName);
  expect(await skillName.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await skillName.fill("Cancelled skill draft");
  await page.keyboard.press("Tab");
  await expect(skillDescription).toBeFocused();
  await skillDescription.fill("Discarded with the keyboard.");
  await page.keyboard.press("Tab");
  await expect(skillInstructions).toBeFocused();
  await skillInstructions.fill("No save should occur.");
  await page.keyboard.press("Tab");
  const skillCancel = page.getByRole("button", { name: "Cancel", exact: true });
  await expect(skillCancel).toBeFocused();
  expect(await skillCancel.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Add skill" })).toHaveCount(0);
  expect(saves).toBe(0);

  await page.getByRole("button", { name: /Add skill/ }).click();
  await tabUntilFocused(page, skillName);
  expect(await skillName.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await skillName.fill("Synthetic audit skill");
  await page.keyboard.press("Tab");
  await page.getByLabel("Description").fill("A browser regression fixture.");
  await page.keyboard.press("Tab");
  await page.getByLabel("Instructions").fill("Use only synthetic test content.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(skillSave).toBeFocused();
  expect(await skillSave.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Synthetic audit skill")).toBeVisible();
  expect(saves).toBe(1);

  await page.getByRole("button", { name: /^Edit skill / }).click();
  await page.getByLabel("Description").fill("Edited synthetic fixture.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Edited synthetic fixture.")).toBeVisible();
  expect(saves).toBe(2);

  await page.reload();
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  await page.getByRole("button", { name: "Plugin", exact: true }).click();
  await expect(page.getByText("Edited synthetic fixture.")).toBeVisible();

  await page.getByRole("button", { name: /^Delete skill / }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading", { name: "Delete this skill?" })).toBeVisible();
  await expectDialogResponsiveAndAccessible(page, confirmation);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  expect(saves).toBe(2);

  await page.getByRole("button", { name: /^Delete skill / }).click();
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Synthetic audit skill")).toHaveCount(0);
  expect(saves).toBe(3);
  expect(library.skills.map((item) => item.name)).toEqual(["Audit built-in"]);

  await page.getByRole("tab", { name: /Persona/ }).click();
  await page.getByRole("button", { name: /Add persona/ }).click();
  const personaDialog = page.getByRole("heading", { name: "Add persona" }).locator("xpath=..");
  await expectDialogResponsiveAndAccessible(page, personaDialog, undefined, "document");
  await page.setViewportSize({ width: 768, height: 1024 });
  const personaName = page.getByLabel("Name");
  const personaDescription = page.getByLabel("Description");
  const personaPrompt = page.getByLabel("Persona prompt");
  const personaSave = page.getByRole("button", { name: "Save", exact: true });
  await expect(personaName).toHaveAttribute("maxlength", "80");
  await expect(personaDescription).toHaveAttribute("maxlength", "500");
  await expect(personaPrompt).toHaveAttribute("maxlength", "20000");
  await tabUntilFocused(page, personaName);
  expect(await personaName.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(personaSave).toBeDisabled();
  await expect(personaName).toHaveAttribute("required", "");
  await expect(personaPrompt).toHaveAttribute("required", "");
  expect(await personaName.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  expect(await personaPrompt.evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
  await personaName.fill("Name only");
  await expect(personaSave).toBeDisabled();
  expect(await personaName.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
  expect(await personaPrompt.evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
  await personaName.fill("");
  await personaName.fill("Synthetic audit persona");
  await page.keyboard.press("Tab");
  await page.getByLabel("Description").fill("Synthetic persona fixture.");
  await page.keyboard.press("Tab");
  await page.getByLabel("Persona prompt").fill("Use concise synthetic test language.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(personaSave).toBeFocused();
  expect(await personaSave.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Synthetic audit persona")).toBeVisible();
  expect(saves).toBe(4);

  await page.getByRole("button", { name: /^Edit persona / }).click();
  await page.getByLabel("Description").fill("Edited synthetic persona fixture.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Edited synthetic persona fixture.")).toBeVisible();
  expect(saves).toBe(5);

  await page.reload();
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  await page.getByRole("button", { name: "Plugin", exact: true }).click();
  await page.getByRole("tab", { name: /Persona/ }).click();
  await expect(page.getByText("Edited synthetic persona fixture.")).toBeVisible();

  await page.getByRole("button", { name: /^Delete persona / }).click();
  const personaConfirmation = page.getByRole("alertdialog");
  await expect(personaConfirmation.getByRole("heading", { name: "Delete this persona?" })).toBeVisible();
  await expectDialogResponsiveAndAccessible(page, personaConfirmation);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.keyboard.press("Escape");
  await expect(personaConfirmation).toBeHidden();
  expect(saves).toBe(5);

  await page.getByRole("button", { name: /^Delete persona / }).click();
  await personaConfirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Synthetic audit persona")).toHaveCount(0);
  expect(saves).toBe(6);
  expect(library.personas).toHaveLength(0);
});
