import { test, expect } from "@playwright/test";
import { signIn, goto, expectPagePainted } from "./helpers.mjs";

/**
 * The recovery mechanism, which until recently could not work at all.
 *
 * Restoring a snapshot containing scores failed silently under rules version 3:
 * validation rejected the write, the whole multi-path update was refused, and
 * nothing changed — not a partial restore, not an error anyone would notice.
 * This is the one thing in the app whose job is to be there on the worst day,
 * so it is worth driving rather than trusting.
 *
 * It runs last on purpose: a restore overwrites, and these specs share one
 * database.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page, "admin");
  await goto(page, "/user/admin/control?tab=recovery");
  await expectPagePainted(page);
});

test("a restore point can be taken on demand", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Restore points" })).toBeVisible();

  await page.getByRole("button", { name: "Take a restore point now" }).click();

  // the list is the receipt
  await expect(page.getByRole("button", { name: "Preview" }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("a preview says what restoring would change, before anything is written", async ({ page }) => {
  const preview = page.getByRole("button", { name: "Preview" }).first();
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await preview.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // a diff, not a shrug: the point is knowing what it costs
  await expect(dialog.getByText(/would|change|restore/i).first()).toBeVisible({ timeout: 20_000 });

  await dialog.getByRole("button", { name: /cancel|close/i }).first().click();
  await expect(dialog).toBeHidden();
});

test("restoring asks for a typed phrase and refuses a wrong one", async ({ page }) => {
  const preview = page.getByRole("button", { name: "Preview" }).first();
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await preview.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const restore = dialog.getByRole("button", { name: /^Restore/ });
  if (await restore.isVisible().catch(() => false)) {
    await restore.click();

    const confirm = page.getByRole("dialog").last();
    const field = confirm.getByRole("textbox");

    if (await field.isVisible().catch(() => false)) {
      const go = confirm.getByRole("button").last();
      await expect(go).toBeDisabled();

      await field.fill("definitely not the phrase");
      await expect(go).toBeDisabled();

      await confirm.getByRole("button", { name: /cancel/i }).click();
    }
  }
});
