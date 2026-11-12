import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("rejected sign-in and sign-up preserve entered values across viewport sizes", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") {
      await route.fulfill({ status: 401, json: { detail: "Not signed in." } });
      return;
    }
    if (path === "/api/auth/signin") {
      await route.fulfill({ status: 401, json: { detail: "Email or password is incorrect." } });
      return;
    }
    if (path === "/api/auth/signup") {
      await route.fulfill({ status: 409, json: { detail: "An account with this email already exists." } });
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

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/signin");
    const signInEmail = page.getByLabel("Email address");
    const signInPassword = page.getByLabel("Password");
    await signInEmail.fill("audit-user@example.invalid");
    await signInPassword.fill("synthetic-audit-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toBeVisible();
    await expect(signInEmail).toHaveValue("audit-user@example.invalid");
    await expect(signInPassword).toHaveValue("synthetic-audit-password");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
    await page.addScriptTag({ content: axeSource });
    await assertBothThemes();
    await assertNoOverflow(viewport.width);

    await page.goto("/signup");
    const signUpEmail = page.getByLabel("Email address");
    const signUpPassword = page.getByLabel("Password", { exact: true });
    const confirmPassword = page.getByLabel("Confirm password");
    await signUpEmail.fill("existing-audit-user@example.invalid");
    await signUpPassword.fill("synthetic-audit-password");
    await confirmPassword.fill("synthetic-audit-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "An account with this email already exists." })).toBeVisible();
    await expect(signUpEmail).toHaveValue("existing-audit-user@example.invalid");
    await expect(signUpPassword).toHaveValue("synthetic-audit-password");
    await expect(confirmPassword).toHaveValue("synthetic-audit-password");
    await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
    await page.addScriptTag({ content: axeSource });
    await assertBothThemes();
    await assertNoOverflow(viewport.width);
  }
});
