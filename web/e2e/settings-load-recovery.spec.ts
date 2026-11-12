import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("Connections loading, error, and retry states work across required viewports", async ({ page }) => {
  let providerReads = 0;
  let chatGPTReads = 0;
  let failProviderLoads = false;
  let failChatGPTLoads = false;
  let allowProviderSuccess = false;
  let allowChatGPTSuccess = false;
  let releaseFirstProviderRead!: () => void;
  let releaseFirstChatGPTRead!: () => void;
  const firstProviderRead = new Promise<void>((resolve) => {
    releaseFirstProviderRead = resolve;
  });
  const firstChatGPTRead = new Promise<void>((resolve) => {
    releaseFirstChatGPTRead = resolve;
  });

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
      providerReads += 1;
      if (!allowProviderSuccess) {
        await firstProviderRead;
        await route.fulfill({ status: 503, json: { detail: "Could not load your providers." } });
      } else if (failProviderLoads) {
        await route.fulfill({ status: 503, json: { detail: "Could not load your providers." } });
      } else {
        await route.fulfill({ json: { active_provider_id: null, providers: [] } });
      }
      return;
    }
    if (url.pathname === "/api/chatgpt-plan") {
      chatGPTReads += 1;
      if (!allowChatGPTSuccess) {
        await firstChatGPTRead;
        await route.fulfill({ status: 503, json: { detail: "Could not load ChatGPT plan status." } });
      } else if (failChatGPTLoads) {
        await route.fulfill({ status: 503, json: { detail: "Could not load ChatGPT plan status." } });
      } else {
        await route.fulfill({ json: { connected: false, email: null, provider_id: null, enabled: false, manage_usage_url: "https://chatgpt.com/settings/usage" } });
      }
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
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  const axeViolations = () => page.evaluate(async () => {
    const axe = Reflect.get(window, "axe") as {
      run: (context: Document) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> }>;
    };
    return (await axe.run(document)).violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
    }));
  });
  const empty = page.getByText("No connections yet. Add an OpenAI-compatible endpoint to get started.");
  await expect(page.getByRole("status", { name: "Loading connections" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading ChatGPT plan status" })).toBeVisible();
  await expect(empty).toBeHidden();
  expect(await axeViolations()).toEqual([]);

  releaseFirstChatGPTRead();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load ChatGPT plan status." })).toBeVisible();
  expect(await axeViolations()).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  expect(await axeViolations()).toEqual([]);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  allowChatGPTSuccess = true;
  await page.getByRole("button", { name: "Retry ChatGPT status" }).click();
  const continueWithChatGPT = page.getByRole("button", { name: "Continue with ChatGPT" });
  await expect(continueWithChatGPT).toBeEnabled();
  await expect(continueWithChatGPT).toHaveCSS("opacity", "1");
  expect(chatGPTReads).toBeGreaterThanOrEqual(2);

  releaseFirstProviderRead();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load your providers." })).toBeVisible();
  expect(await axeViolations()).toEqual([]);
  allowProviderSuccess = true;
  await page.getByRole("button", { name: "Retry settings" }).click();
  await expect(empty).toBeVisible();
  expect(await axeViolations()).toEqual([]);
  expect(providerReads).toBeGreaterThanOrEqual(2);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: resolve("../docs/openui-ux-connections-empty-mobile-after.png"), fullPage: true });

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    failProviderLoads = true;
    failChatGPTLoads = true;
    await page.setViewportSize(viewport);
    await page.goto("/settings");
    await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

    await expect(page.getByRole("alert").filter({ hasText: "Could not load your providers." })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Could not load ChatGPT plan status." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await axeViolations(), `recovered state at ${viewport.width}x${viewport.height}`).toEqual([]);

    failProviderLoads = false;
    failChatGPTLoads = false;
    await page.getByRole("button", { name: "Retry settings" }).click();
    await expect(empty).toBeVisible();
    await page.getByRole("button", { name: "Retry ChatGPT status" }).click();
    const continueWithChatGPT = page.getByRole("button", { name: "Continue with ChatGPT" });
    await expect(continueWithChatGPT).toBeEnabled();
    await expect(continueWithChatGPT).toHaveCSS("opacity", "1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await axeViolations()).toEqual([]);
  }
});
