import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Plugin and MCP settings expose loading, error, and retry states", async ({ page }) => {
  let pluginReads = 0;
  let mcpReads = 0;
  let allowPluginSuccess = false;
  let allowMcpSuccess = false;
  let releasePlugin!: () => void;
  let releaseMcp!: () => void;
  const createPluginGate = () => new Promise<void>((resolveGate) => { releasePlugin = resolveGate; });
  const createMcpGate = () => new Promise<void>((resolveGate) => { releaseMcp = resolveGate; });
  let pluginGate = createPluginGate();
  let mcpGate = createMcpGate();

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
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [] } });
      return;
    }
    if (url.pathname === "/api/agent-library" && method === "GET") {
      pluginReads += 1;
      if (!allowPluginSuccess) {
        await pluginGate;
        await route.fulfill({ status: 503, json: { detail: "Could not load plugin settings." } });
      } else {
        await route.fulfill({ json: { skills: [], personas: [] } });
      }
      return;
    }
    if (url.pathname === "/api/mcp-servers" && method === "GET") {
      mcpReads += 1;
      if (!allowMcpSuccess) {
        await mcpGate;
        await route.fulfill({ status: 503, json: { detail: "Could not load MCP settings." } });
      } else {
        await route.fulfill({ json: {
          builtin: { id: "searxng", name: "SearXNG Web Search", transport: "stdio", url: "http://127.0.0.1:8080", enabled: true, built_in: true, description: "Local test search." },
          servers: [],
        } });
      }
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "Plugin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plugin", exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading Plugin settings" })).toBeVisible();
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  const axeViolations = () => page.evaluate(async () => {
    const axe = Reflect.get(window, "axe") as {
      run: (context: Document) => Promise<{ violations: Array<{ id: string }> }>;
    };
    return (await axe.run(document)).violations.map((violation) => violation.id);
  });
  expect(await axeViolations()).toEqual([]);

  releasePlugin();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load plugin settings." })).toBeVisible();
  expect(await axeViolations()).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  expect(await axeViolations()).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  allowPluginSuccess = true;
  await page.getByRole("button", { name: "Retry Plugin settings" }).click();
  await expect(page.getByRole("tab", { name: "Skills (0)" })).toBeVisible();
  expect(pluginReads).toBeGreaterThanOrEqual(2);

  await page.getByRole("tab", { name: "MCP servers" }).click();
  await expect(page.getByRole("status", { name: "Loading MCP settings" })).toBeVisible();
  expect(await axeViolations()).toEqual([]);
  releaseMcp();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load MCP settings." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add server" })).toBeDisabled();
  expect(await axeViolations()).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  expect(await axeViolations()).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  allowMcpSuccess = true;
  await page.getByRole("button", { name: "Retry MCP settings" }).click();
  await expect(page.getByText("No custom MCP servers yet.")).toBeVisible();
  await expect(page.getByText("SearXNG Web Search")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add server" })).toHaveCSS("opacity", "1");
  expect(mcpReads).toBeGreaterThanOrEqual(2);
  expect(await axeViolations()).toEqual([]);

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    allowPluginSuccess = false;
    pluginGate = createPluginGate();
    await page.goto("/settings");
    await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.getByRole("button", { name: "Plugin", exact: true }).click();
    await expect(page.getByRole("status", { name: "Loading Plugin settings" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await axeViolations()).toEqual([]);
    releasePlugin();
    await expect(page.getByRole("alert").filter({ hasText: "Could not load plugin settings." })).toBeVisible();
    expect(await axeViolations()).toEqual([]);
    allowPluginSuccess = true;
    await page.getByRole("button", { name: "Retry Plugin settings" }).click();
    await expect(page.getByRole("tab", { name: "Skills (0)" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await axeViolations()).toEqual([]);

    allowMcpSuccess = false;
    mcpGate = createMcpGate();
    await page.getByRole("tab", { name: "MCP servers" }).click();
    await expect(page.getByRole("status", { name: "Loading MCP settings" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await axeViolations()).toEqual([]);
    releaseMcp();
    await expect(page.getByRole("alert").filter({ hasText: "Could not load MCP settings." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add server" })).toBeDisabled();
    expect(await axeViolations()).toEqual([]);
    allowMcpSuccess = true;
    await page.getByRole("button", { name: "Retry MCP settings" }).click();
    await expect(page.getByText("No custom MCP servers yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add server" })).toHaveCSS("opacity", "1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await axeViolations()).toEqual([]);
  }
});
