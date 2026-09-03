import { test, expect } from "@playwright/test";
import { signIn, goto, expectPagePainted } from "./helpers.mjs";

/**
 * A judge scoring a team, which is the thing the whole app exists to collect.
 *
 * Nothing tested this end to end. The rubric is checked as arithmetic, the
 * write is checked with a mocked database, and the rules are checked in
 * isolation -- but until now nothing had a judge open a card, fill it in, press
 * submit, and confirm the score reached the place an organizer reads it from.
 * That path crosses every layer at once: the panel the schedule wrote, the
 * assignment the rules treat as proof of assignment, and the score node the
 * standings are computed from.
 */

/** The five criteria, in the order the dialog renders them. */
const SCORES = ["8", "7", "9", "4", "5"];

async function openFirstCard(page) {
  await goto(page, "/user/judging");
  await expectPagePainted(page);

  const card = page.getByRole("button", { name: "Score team" }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });

  const teamName = await page
    .locator("div")
    .filter({ has: page.getByRole("button", { name: "Score team" }) })
    .first()
    .textContent();

  await card.click();
  return teamName ?? "";
}

test("a judge has cards once a schedule is published", async ({ page }) => {
  await signIn(page, "judge");
  await goto(page, "/user/judging");
  await expectPagePainted(page);

  await expect(page.getByText("First round")).toBeVisible();
  await expect(page.getByText(/No assignments yet/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Score team" }).first()).toBeVisible();
});

test("the score cannot be submitted until every criterion is answered", async ({ page }) => {
  await signIn(page, "judge");
  await openFirstCard(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // the rules require every criterion, so the button is the guard rather than
  // an error after the fact
  await expect(dialog.getByRole("button", { name: "Submit score" })).toBeDisabled();
});

test("a filled-in card submits, and the team then reads as scored", async ({ page }) => {
  await signIn(page, "judge");
  await openFirstCard(page);

  const dialog = page.getByRole("dialog");
  const selects = dialog.locator(".MuiSelect-select");
  await expect(selects).toHaveCount(5);

  for (let i = 0; i < SCORES.length; i++) {
    await selects.nth(i).click();
    await page.getByRole("option", { name: SCORES[i], exact: true }).click();
  }

  await dialog.getByRole("button", { name: "Yes" }).click();
  await dialog.getByLabel(/Notes/).fill("Strong problem statement, thin on viability.");

  const submit = dialog.getByRole("button", { name: "Submit score" });
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // the card is the receipt: it cannot be scored twice
  await expect(page.getByRole("button", { name: "Scored" }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Scored" }).first()).toBeDisabled();
});

test("the score survives a reload, because it reached the database", async ({ page }) => {
  await signIn(page, "judge");
  await goto(page, "/user/judging");

  // whatever the previous test scored is still scored
  await expect(page.getByRole("button", { name: "Scored" }).first()).toBeVisible({
    timeout: 20_000,
  });

  await page.reload();
  await expect(page.getByRole("button", { name: "Scored" }).first()).toBeVisible({
    timeout: 20_000,
  });
});

test("an organizer sees that score arrive on judging progress", async ({ browser }) => {
  const admin = await browser.newPage();
  await signIn(admin, "admin");
  await goto(admin, "/user/admin/judging");
  await expectPagePainted(admin);

  // the count is the organizer's whole view of whether judging is happening
  const stat = admin.getByText(/scores in/).first();
  await expect(stat).toBeVisible();

  await expect(admin.getByText(/^0\/\d+$/)).toHaveCount(0);
  await admin.close();
});
