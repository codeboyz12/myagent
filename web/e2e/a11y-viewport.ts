import { expect, type Locator, type Page } from "@playwright/test";

export const auditViewports = [
  { width: 375, height: 812 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

export async function waitForVisualSettling(page: Page) {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function expectNoAxeViolations(page: Page) {
  const violations = await page.evaluate(async () => {
    const axe = Reflect.get(window, "axe") as {
      run: (context: Document) => Promise<{ violations: Array<{ id: string; help: string }> }>;
    };
    return (await axe.run(document)).violations.map(({ id, help }) => ({ id, help }));
  });
  expect(violations).toEqual([]);
}

/** Check a visible dialog's viewport fit and axe result in both themes at each required size. */
export async function expectDialogResponsiveAndAccessible(
  page: Page,
  dialog: Locator,
  viewports: readonly { width: number; height: number }[] = auditViewports,
  verticalFit: "viewport" | "document" = "viewport",
) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await waitForVisualSettling(page);
    await expect(dialog, `interactive panel visible at ${viewport.width}×${viewport.height}`).toBeVisible({ timeout: 5_000 });
    const bounds = await dialog.boundingBox();
    expect(bounds, `dialog visible at ${viewport.width}×${viewport.height}`).not.toBeNull();
    expect(bounds!.x, `dialog left at ${viewport.width}px`).toBeGreaterThanOrEqual(0);
    expect(bounds!.y, `dialog top at ${viewport.height}px`).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width, `dialog right at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width);
    if (verticalFit === "viewport") {
      expect(bounds!.y + bounds!.height, `dialog bottom at ${viewport.height}px`).toBeLessThanOrEqual(viewport.height);
    } else {
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(bounds!.y + bounds!.height, `panel bottom at ${viewport.height}px`).toBeLessThanOrEqual(documentHeight);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    await expectNoAxeViolations(page);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await waitForVisualSettling(page);
    await expectNoAxeViolations(page);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await waitForVisualSettling(page);
  }
}
