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

test("MCP settings add, edit, reload, and confirm removal without contacting the endpoint", async ({ page }) => {
  type Server = {
    id: string;
    name: string;
    transport: "http";
    url: string;
    enabled: boolean;
    built_in: false;
    token_configured?: boolean;
    token?: string;
    clear_token?: boolean;
  };
  const builtin = {
    id: "searxng" as const,
    name: "SearXNG Web Search",
    transport: "stdio" as const,
    url: "http://127.0.0.1:8080",
    enabled: true,
    built_in: true as const,
    description: "Synthetic built-in fixture.",
  };
  let servers: Server[] = [];
  let saves = 0;
  let externalRequests = 0;
  let lastSavedServers: Server[] = [];
  let checkRequests = 0;

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
    if (url.pathname === "/api/mcp-servers" && route.request().method() === "GET") {
      await route.fulfill({ json: { builtin, servers } });
      return;
    }
    if (url.pathname === "/api/mcp-servers" && route.request().method() === "PUT") {
      const body = await route.request().postDataJSON();
      lastSavedServers = body.servers;
      servers = body.servers.map((server: Server) => {
        const previous = servers.find((item) => item.id === server.id);
        return {
          id: server.id,
          name: server.name,
          transport: server.transport,
          url: server.url,
          enabled: server.enabled,
          built_in: false,
          token_configured: server.clear_token ? false : Boolean(server.token) || Boolean(previous?.token_configured),
        };
      });
      saves += 1;
      await route.fulfill({ json: { builtin: { ...builtin, enabled: body.builtin_enabled }, servers } });
      return;
    }
    if (url.pathname === "/api/mcp-servers" && route.request().method() === "POST") {
      checkRequests += 1;
      await route.fulfill({ json: { ok: true, tool_count: 2 } });
      return;
    }
    if (url.hostname === "mcp.audit.invalid") externalRequests += 1;
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings");
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  await page.getByRole("button", { name: "Plugin", exact: true }).click();
  await page.getByRole("tab", { name: "MCP servers" }).click();
  await expect(page.getByRole("heading", { name: "MCP servers" })).toBeVisible();
  await expect(page.getByText("No custom MCP servers yet.")).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: resolve("../docs/openui-ux-mcp-empty-mobile-after.png"), fullPage: true });

  await page.getByRole("button", { name: /Add server/ }).click();
  const addDialog = page.getByRole("heading", { name: "Add MCP server" }).locator("xpath=..");
  await expectDialogResponsiveAndAccessible(page, addDialog, undefined, "document");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: resolve("../docs/openui-ux-mcp-add-mobile-after.png"), fullPage: true });
  const serverName = page.getByLabel("Name");
  const serverUrl = page.getByLabel("Streamable HTTP endpoint");
  const serverSave = page.getByRole("button", { name: "Save server" });
  await expect(serverName).toHaveAttribute("maxlength", "80");
  await expect(serverUrl).toHaveAttribute("maxlength", "2048");
  await expect(serverSave).toBeDisabled();
  await expect(serverName).toHaveAttribute("required", "");
  await expect(serverUrl).toHaveAttribute("required", "");
  expect(await serverName.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  expect(await serverUrl.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  await serverName.fill("Invalid URL fixture");
  await serverUrl.fill("not a URL");
  expect(await serverUrl.evaluate((element: HTMLInputElement) => element.validity.typeMismatch)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Add MCP server" })).toBeVisible();
  expect(saves).toBe(0);
  await serverName.fill("");
  await serverUrl.fill("");
  await serverName.fill("Name only");
  await expect(serverSave).toBeDisabled();
  expect(await serverName.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
  expect(await serverUrl.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  await serverName.fill("");
  await tabUntilFocused(page, serverName);
  expect(await serverName.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await serverName.fill("Cancelled MCP draft");
  await page.keyboard.press("Tab");
  await expect(serverUrl).toBeFocused();
  await serverUrl.fill("https://mcp.audit.invalid/cancelled");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const serverCancel = page.getByRole("button", { name: "Cancel", exact: true });
  await expect(serverCancel).toBeFocused();
  expect(await serverCancel.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Add MCP server" })).toHaveCount(0);
  expect(saves).toBe(0);

  await page.getByRole("button", { name: /Add server/ }).click();
  await tabUntilFocused(page, serverName);
  expect(await serverName.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await serverName.fill("Synthetic MCP fixture");
  await page.keyboard.press("Tab");
  await serverUrl.fill("https://mcp.audit.invalid/mcp");
  await page.keyboard.press("Tab");
  const serverToken = page.getByLabel("Bearer token");
  await expect(serverToken).toHaveAttribute("maxlength", "4096");
  await serverToken.fill("synthetic-test-token");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(serverSave).toBeFocused();
  expect(await serverSave.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Synthetic MCP fixture")).toBeVisible();
  expect(saves).toBe(1);
  expect(lastSavedServers[0]).toMatchObject({ token: "synthetic-test-token", clear_token: false });
  await expect(page.getByText("Streamable HTTP · Authentication configured")).toBeVisible();
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Connected · 2 tools found" })).toBeVisible();
  expect(checkRequests).toBe(1);

  await page.getByRole("button", { name: /^Edit / }).click();
  const editToken = page.getByLabel("Bearer token");
  await expect(editToken).toHaveValue("");
  await expect(editToken).toHaveAttribute("placeholder", "Saved token · leave blank to keep");
  await page.getByLabel("Streamable HTTP endpoint").fill("https://mcp.audit.invalid/edited");
  await editToken.fill("replacement-synthetic-token");
  await page.getByRole("button", { name: "Save server" }).click();
  await expect(page.getByText("https://mcp.audit.invalid/edited")).toBeVisible();
  expect(saves).toBe(2);
  expect(lastSavedServers[0]).toMatchObject({ token: "replacement-synthetic-token", clear_token: false });

  await page.reload();
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  await page.getByRole("button", { name: "Plugin", exact: true }).click();
  await page.getByRole("tab", { name: "MCP servers" }).click();
  await expect(page.getByText("https://mcp.audit.invalid/edited")).toBeVisible();
  await page.getByRole("button", { name: /^Edit / }).click();
  await page.getByLabel("Remove the saved token").check();
  await page.getByRole("button", { name: "Save server" }).click();
  expect(saves).toBe(3);
  expect(lastSavedServers[0]).toMatchObject({ token: "", clear_token: true });
  await expect(page.getByText("Streamable HTTP · Authentication configured")).toHaveCount(0);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading", { name: "Delete this MCP server?" })).toBeVisible();
  await expectDialogResponsiveAndAccessible(page, confirmation);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  expect(saves).toBe(3);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmation.getByRole("button", { name: "Delete server" }).click();
  await expect(page.getByText("No custom MCP servers yet.")).toBeVisible();
  expect(saves).toBe(4);
  expect(servers).toHaveLength(0);
  expect(externalRequests).toBe(0);

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect.poll(() => page.locator("html").getAttribute("class")).toContain("dark");
  expect(await page.evaluate(() => localStorage.getItem("myagent-theme"))).toBe("dark");
  await page.reload();
  await expect.poll(() => page.locator("html").getAttribute("class")).toContain("dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect.poll(() => page.locator("html").getAttribute("class")).not.toContain("dark");
});
