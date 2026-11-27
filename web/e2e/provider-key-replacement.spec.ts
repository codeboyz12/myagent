import { expect, test } from "@playwright/test";

test("editing a provider keeps, replaces, or removes its saved key explicitly", async ({ page }) => {
  const saves: Array<Record<string, unknown>> = [];
  const provider = {
    id: "audit-provider",
    name: "Audit provider",
    base_url: "https://api.audit.invalid/v1",
    model_id: "audit-model",
    reasoning_effort: "default",
    enabled: true,
    api_key_configured: true,
    model_controls: { "audit-model": [{
      id: "thinking",
      name: "Thinking",
      parameter: "reasoning_effort",
      options: [{ label: "Low", value: "low" }, { label: "Medium", value: "medium" }, { label: "High", value: "high" }],
      default_value: null,
    }] },
    model_control_selections: {},
    models: [{ id: "audit-model", name: "Audit model" }],
  };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/model-settings") {
      await route.fulfill({ json: {
        configured: true,
        base_url: provider.base_url,
        model_id: provider.model_id,
        reasoning_effort: "default",
        api_key_configured: true,
        active_provider_id: provider.id,
        model_controls: [],
        model_control_selections: {},
      } });
      return;
    }
    if (url.pathname === "/api/model-providers" && method === "GET") {
      await route.fulfill({ json: { active_provider_id: provider.id, providers: [provider] } });
      return;
    }
    if (url.pathname === "/api/model-providers/audit-provider" && method === "PUT") {
      saves.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 200, json: provider });
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
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings");

  const edit = page.getByRole("button", { name: "Edit", exact: true });
  await edit.click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox", { name: "API key" })).toHaveAttribute("placeholder", "Saved key · leave blank to keep");
  const settingName = dialog.getByRole("textbox", { name: "Setting name" });
  await expect(settingName).toHaveValue("Thinking");
  await settingName.click();
  await expect(settingName).toBeFocused();
  await settingName.fill("Reasoning effort");
  await dialog.getByRole("textbox", { name: "Provider parameter" }).fill("reasoning_effort");
  await dialog.getByRole("textbox", { name: "Options (comma-separated)" }).fill("low, medium, high");
  await dialog.getByLabel("Default").selectOption("medium");
  await dialog.getByRole("textbox", { name: "API key" }).fill("synthetic-replacement-key");
  await dialog.getByRole("button", { name: "Save connection" }).click();
  await expect(dialog).toBeHidden();

  await edit.click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save connection" }).click();
  await expect(dialog).toBeHidden();

  await edit.click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Remove the saved API key").check();
  await dialog.getByRole("button", { name: "Save connection" }).click();
  await expect(dialog).toBeHidden();

  expect(saves).toHaveLength(3);
  expect(saves[0]).toMatchObject({ api_key: "synthetic-replacement-key", clear_api_key: false });
  expect(saves[0].model_controls).toEqual([{
    id: "thinking",
    name: "Reasoning effort",
    parameter: "reasoning_effort",
    options: [{ label: "Low", value: "low" }, { label: "Medium", value: "medium" }, { label: "High", value: "high" }],
    default_value: "medium",
  }]);
  expect(saves[1]).toMatchObject({ api_key: null, clear_api_key: false });
  expect(saves[2]).toMatchObject({ api_key: null, clear_api_key: true });
});
