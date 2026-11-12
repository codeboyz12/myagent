import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("sign-in form keeps native required validation and keyboard focus", async ({ page }) => {
  const signInRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/auth/signin")) signInRequests.push(request.url());
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in to myagent" })).toBeVisible();

  const email = page.getByLabel("Email address");
  const password = page.getByLabel("Password");
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: resolve("../docs/openui-ux-signin-mobile-after.png"), fullPage: true });
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(email).toBeFocused();
  await expect.poll(() => signInRequests).toHaveLength(0);
});

test("auth endpoint rejects cross-origin sign-in before processing credentials", async ({ request, baseURL }) => {
  const response = await request.post(`${baseURL}/api/auth/signin`, {
    headers: {
      Origin: "https://attacker.invalid",
      "Content-Type": "application/json",
    },
    data: { email: "audit@example.invalid", password: "a-long-synthetic-password" },
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    detail: "Cross-origin request rejected.",
  });
});

test("same-origin malformed sign-in reaches request validation without touching an account", async ({ request, baseURL }) => {
  const response = await request.post(`${baseURL}/api/auth/signin`, {
    headers: {
      Origin: baseURL!,
      "Content-Type": "application/json",
    },
    data: { email: "not-an-email", password: "short" },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    detail: "Enter a valid email and password.",
  });
});

test("sign-up reports mismatched synthetic passwords without submitting", async ({ page }) => {
  const signupRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/auth/signup")) signupRequests.push(request.url());
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByLabel("Email address").fill("ux-audit@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-1");
  await page.getByLabel("Confirm password").fill("synthetic-password-2");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Your passwords do not match." }),
  ).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: resolve("../docs/openui-ux-signup-error-mobile-after.png"), fullPage: true });
  expect(signupRequests).toHaveLength(0);
});

test("unknown route provides a semantic recovery path to chat", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(`audit-404-${unique}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-audit-password");
  await page.getByLabel("Confirm password").fill("synthetic-audit-password");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/chat$/);
  const response = await page.goto("/audit-missing-route");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "This page could not be found." })).toBeVisible();
  await page.getByRole("link", { name: "Back to chat" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole("region", { name: "Start a conversation" })).toBeVisible();
});
