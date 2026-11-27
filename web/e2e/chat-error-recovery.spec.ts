import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("failed chat sends keep the draft and expose an accessible dismissible error", async ({ page }) => {
  const sessionId = "8c1dbd8a-d3ca-4c49-8ebc-0ba1fdb70f8a";
  let chatRequests = 0;

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [{ session_id: sessionId, created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", title: "Synthetic failed chat", last_turn_status: null }] } });
      return;
    }
    if (url.pathname === `/api/sessions/${sessionId}/messages`) {
      await route.fulfill({ json: { session_id: sessionId, messages: [] } });
      return;
    }
    if (url.pathname === "/api/model-settings") {
      await route.fulfill({ json: {
        configured: true,
        base_url: "https://api.audit.invalid/v1",
        model_id: "audit-model",
        reasoning_effort: "default",
        api_key_configured: true,
        active_provider_id: "audit-provider",
        model_controls: [],
        model_control_selections: {},
      } });
      return;
    }
    if (url.pathname === "/api/model-providers") {
      await route.fulfill({ json: { active_provider_id: "audit-provider", providers: [] } });
      return;
    }
    if (url.pathname === "/api/chatgpt-plan") {
      await route.fulfill({ json: { connected: false, email: null, provider_id: null, enabled: false, manage_usage_url: "https://chatgpt.com/settings/usage" } });
      return;
    }
    if (url.pathname === "/api/chat" && route.request().method() === "POST") {
      chatRequests += 1;
      await route.fulfill({ status: 503, json: { detail: "Synthetic model unavailable." } });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/chat/${sessionId}`);
  await expect(page.getByRole("heading", { name: "Synthetic failed chat" })).toBeVisible();
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });

  const assertNoAxeViolations = async () => {
    const violations = await page.evaluate(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const axe = Reflect.get(window, "axe") as {
        run: (context: Document) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> }>;
      };
      return (await axe.run(document)).violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) }));
    });
    expect(violations).toEqual([]);
  };
  const assertNoOverflow = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  };

  const viewports = [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];
  for (const [index, viewport] of viewports.entries()) {
    await page.setViewportSize(viewport);
    const composer = page.getByLabel("Message myagent");
    await composer.fill(`Unsent draft at ${viewport.width}px`);
    await composer.press("Enter");
    const error = page.getByRole("alert").filter({ hasText: "Synthetic model unavailable." });
    await expect(error).toBeVisible();
    await expect(error.getByRole("button", { name: "Dismiss" })).toBeVisible();
    await expect(composer).toHaveValue(`Unsent draft at ${viewport.width}px`);
    expect(chatRequests).toBe(index + 1);
    await assertNoAxeViolations();
    await assertNoOverflow();

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(200);
    await assertNoAxeViolations();
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.waitForTimeout(200);
    await assertNoAxeViolations();

    await error.getByRole("button", { name: "Dismiss" }).click();
    await expect(error).toHaveCount(0);
    await expect(composer).toHaveValue(`Unsent draft at ${viewport.width}px`);
  }
});

test("conversation history load failures are accessible and return to the conversation list", async ({ page }) => {
  const sessionId = "3971f5f0-22a1-4921-a47a-3f76bf7e4a2e";
  let releaseHistory!: () => void;
  const createHistoryGate = () => new Promise<void>((resolve) => { releaseHistory = resolve; });
  let historyGate = createHistoryGate();

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [{ session_id: sessionId, created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", title: "Synthetic history error", last_turn_status: null }] } });
      return;
    }
    if (url.pathname === `/api/sessions/${sessionId}/messages`) {
      await historyGate;
      await route.fulfill({ status: 503, json: { detail: "Could not load the saved conversation." } });
      return;
    }
    if (url.pathname === "/api/model-settings") {
      await route.fulfill({ json: {
        configured: true,
        base_url: "https://api.audit.invalid/v1",
        model_id: "audit-model",
        reasoning_effort: "default",
        api_key_configured: true,
        active_provider_id: "audit-provider",
        model_controls: [],
        model_control_selections: {},
      } });
      return;
    }
    if (url.pathname === "/api/model-providers") {
      await route.fulfill({ json: { active_provider_id: "audit-provider", providers: [] } });
      return;
    }
    if (url.pathname === "/api/chatgpt-plan") {
      await route.fulfill({ json: { connected: false, email: null, provider_id: null, enabled: false, manage_usage_url: "https://chatgpt.com/settings/usage" } });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  const axeSource = await readFile(resolve("node_modules/axe-core/axe.js"), "utf8");
  const assertNoAxeViolations = async () => {
    const violations = await page.evaluate(async () => {
      const axe = Reflect.get(window, "axe") as {
        run: (context: Document) => Promise<{ violations: Array<{ id: string }> }>;
      };
      return (await axe.run(document)).violations.map(({ id }) => id);
    });
    expect(violations).toEqual([]);
  };
  const assertBothThemes = async () => {
    await assertNoAxeViolations();
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(200);
    await assertNoAxeViolations();
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await page.waitForTimeout(200);
  };
  const assertNoOverflow = async (width: number) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `no overflow at ${width}px`).toBe(true);
  };
  const viewports = [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];

  for (const [index, viewport] of viewports.entries()) {
    await page.setViewportSize(viewport);
    if (index > 0) {
      historyGate = createHistoryGate();
      await page.reload();
      await page.addScriptTag({ content: axeSource });
    } else {
      await page.goto(`/chat/${sessionId}`);
      await page.addScriptTag({ content: axeSource });
    }
    await expect(page.getByRole("status").filter({ hasText: "Opening conversation" })).toBeVisible();
    await assertBothThemes();
    await assertNoOverflow(viewport.width);
    releaseHistory();

    const error = page.getByRole("alert").filter({ hasText: "Could not load the saved conversation." });
    await expect(error).toBeVisible();
    await expect(error.getByRole("button", { name: "Back to conversations" })).toBeVisible();
    await assertBothThemes();
    await assertNoOverflow(viewport.width);
  }

  await page.getByRole("button", { name: "Back to conversations" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("region", { name: "Start a conversation" })).toBeVisible();
});
