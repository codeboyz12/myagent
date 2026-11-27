import { expect, test } from "@playwright/test";

test("synthetic account saves Plugin settings through the isolated SQLite API", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(`audit-${unique}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-audit-password");
  await page.getByLabel("Confirm password").fill("synthetic-audit-password");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/chat$/);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Plugin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plugin", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Add skill/ }).click();
  await page.getByLabel("Name").fill(`SQLite persistence ${unique}`);
  await page.getByLabel("Description").fill("Saved through the real API in a disposable database.");
  await page.getByLabel("Instructions").fill("Synthetic test content only.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`SQLite persistence ${unique}`)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Plugin", exact: true }).click();
  await expect(page.getByText(`SQLite persistence ${unique}`)).toBeVisible();

  await page.getByRole("button", { name: /^Delete skill / }).last().click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation.getByRole("heading", { name: "Delete this skill?" })).toBeVisible();
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(`SQLite persistence ${unique}`)).toHaveCount(0);
});
