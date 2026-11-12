import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expectDialogResponsiveAndAccessible } from "./a11y-viewport";

test("starting prompt picker stays accessible across viewports and applies a keyboard choice", async ({ page }) => {
  let chatRequests = 0;
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/sessions") {
      await route.fulfill({ json: { sessions: [] } });
    } else if (pathname === "/api/model-settings") {
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
    } else if (pathname === "/api/model-providers") {
      await route.fulfill({ json: { active_provider_id: null, providers: [] } });
    } else if (pathname === "/api/chatgpt-plan") {
      await route.fulfill({ json: { connected: false, email: null, provider_id: null, enabled: false, manage_usage_url: "https://chatgpt.com/settings/usage" } });
    } else if (pathname === "/api/chat") {
      chatRequests += 1;
      await route.fulfill({ status: 500, json: { detail: "This flow must not send a chat." } });
    } else {
      await route.fulfill({ status: 404, json: { detail: "Not found" } });
    }
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/chat");
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  const openPicker = page.getByRole("button", { name: "Choose a suggested prompt" });
  await openPicker.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Choose a starting prompt" });
  await expect(dialog).toBeVisible();
  await expectDialogResponsiveAndAccessible(page, dialog);
  await page.setViewportSize({ width: 375, height: 812 });

  const choice = dialog.getByRole("button", { name: /Think through an idea/ });
  for (let index = 0; index < 10; index += 1) {
    if (await choice.evaluate((element) => document.activeElement === element)) break;
    await page.keyboard.press("Tab");
  }
  await expect(choice).toBeFocused();
  expect(await choice.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Message myagent")).toHaveValue("Think through an idea");
  expect(chatRequests).toBe(0);
});

test("existing conversation streams a reply and renders multiple tool activities, markdown, and code", async ({ page }) => {
  const sessionId = "c33454ca-11e4-4fa7-97b3-31fd561e5ad1";
  const now = new Date().toISOString();
  const createdSession = {
    session_id: sessionId,
    created_at: now,
    updated_at: now,
    last_turn_status: null,
    title: "Synthetic chat history",
  };
  const sessions = [createdSession];
  let submittedContent = "";
  let regenerationRequests = 0;

  await page.route("https://images.audit.invalid/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9" viewBox="0 0 16 9"><rect width="16" height="9" fill="#d4d4d8"/></svg>',
    });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/sessions" && method === "GET") {
      await route.fulfill({ json: { sessions } });
      return;
    }
    if (url.pathname === `/api/sessions/${sessionId}/messages` && method === "GET") {
      await route.fulfill({ json: { session_id: sessionId, messages: [] } });
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
    if (url.pathname === "/api/chat" && method === "POST") {
      const requestBody = await route.request().postDataJSON();
      submittedContent = requestBody.content;
      if (requestBody.regeneratePrevious) regenerationRequests += 1;
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "start" });
          writer.write({
            type: "data-tool-activity",
            id: "synthetic-tool-call",
            data: {
              tool_call_id: "synthetic-tool-call",
              tool_name: "list_files",
              arguments: { path: "/workspace" },
              status: "completed",
              sources: [{ url: "https://docs.audit.invalid/guide", title: "Audit guide" }],
              images: [{
                url: "https://images.audit.invalid/synthetic.svg",
                source_url: "https://photos.audit.invalid/result",
                title: "Synthetic result photo",
              }],
            },
          });
          writer.write({
            type: "data-tool-activity",
            id: "synthetic-tool-call-2",
            data: {
              tool_call_id: "synthetic-tool-call-2",
              tool_name: "read_file",
              arguments: { path: "/workspace/README.md" },
              status: "completed",
            },
          });
          writer.write({ type: "text-start", id: "synthetic-message" });
          writer.write({
            type: "text-delta",
            id: "synthetic-message",
            delta: "Synthetic **assistant reply**.\n\n```ts\nconst answer = 42;\n```",
          });
          writer.write({ type: "text-end", id: "synthetic-message" });
          writer.write({ type: "finish", finishReason: "stop" });
        },
      });
      const response = createUIMessageStreamResponse({ stream });
      await route.fulfill({
        status: response.status,
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: await response.text(),
      });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: "Not found" } });
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/chat");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Synthetic chat history" }).click();
  await expect(page).toHaveURL(new RegExp(`/chat/${sessionId}$`));
  const composer = page.getByLabel("Message myagent");
  await expect(composer).toBeEnabled();
  await composer.fill("Summarize a synthetic test conversation.");
  await page.keyboard.press("Tab");
  const modelSelector = page.getByRole("combobox", { name: "Model" });
  await expect(modelSelector).toBeFocused();
  expect(await modelSelector.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Tab");
  const sendButton = page.getByRole("button", { name: "Send message" });
  await expect(sendButton).toBeFocused();
  expect(await sendButton.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(modelSelector).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(composer).toBeFocused();
  await composer.press("Enter");

  await expect(
    page.getByRole("region", { name: "Messages" })
      .getByText("Summarize a synthetic test conversation.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("assistant reply", { exact: true })).toBeVisible();
  await expect(page.locator("pre code")).toContainText("const answer = 42;");
  await expect(page.getByRole("button", { name: /Worked through 2 steps/ })).toBeVisible();
  const listFilesActivity = page.getByRole("button", { name: /Workspace files listed/ });
  const readFileActivity = page.getByRole("button", { name: /Workspace file read/ });
  await expect(listFilesActivity).toBeVisible();
  await expect(readFileActivity).toBeVisible();
  await listFilesActivity.focus();
  expect(await listFilesActivity.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(listFilesActivity).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("pre").filter({ hasText: '"path": "/workspace"' })).toBeVisible();
  await readFileActivity.focus();
  expect(await readFileActivity.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await page.keyboard.press("Enter");
  await expect(readFileActivity).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("pre").filter({ hasText: '"path": "/workspace/README.md"' })).toBeVisible();
  const imageCard = page.getByRole("link", { name: "Synthetic result photo" });
  const image = imageCard.locator("img");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute("src", "https://images.audit.invalid/synthetic.svg");
  await expect(imageCard).toHaveAttribute("href", "https://photos.audit.invalid/result");
  const sourceToggle = page.getByRole("button", { name: /Sources 1/ });
  await expect(sourceToggle).toBeVisible();
  await sourceToggle.click();
  await expect(page.getByRole("link", { name: "Audit guide" })).toHaveAttribute("href", "https://docs.audit.invalid/guide");
  await expect(page.locator('a[href="https://photos.audit.invalid/result"]')).toHaveAttribute("rel", "noopener noreferrer");
  expect(submittedContent).toBe("Summarize a synthetic test conversation.");
  await page.getByRole("button", { name: "Regenerate response" }).click();
  await expect.poll(() => regenerationRequests).toBe(1);
  await expect(page.getByRole("region", { name: "Messages" }).getByText("Summarize a synthetic test conversation.", { exact: true })).toHaveCount(1);
  await page.addScriptTag({ content: await readFile(resolve("node_modules/axe-core/axe.js"), "utf8") });
  const axeViolations = await page.evaluate(async () => {
    const axe = Reflect.get(window, "axe") as {
      run: (context: Document) => Promise<{ violations: Array<{ id: string }> }>;
    };
    return (await axe.run(document)).violations.map((violation) => violation.id);
  });
  expect(axeViolations).toEqual([]);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await listFilesActivity.evaluate((element) => (element as HTMLButtonElement).blur());
  await page.screenshot({ path: resolve("../docs/openui-ux-chat-synthetic-mobile-after.png"), fullPage: true });
});
