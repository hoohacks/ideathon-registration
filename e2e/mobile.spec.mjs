import { test, expect } from "@playwright/test";
import { signIn, goto, expectPagePainted, judge } from "./helpers.mjs";

/**
 * The app on a phone, which is where judging actually happens.
 *
 * A judge is standing in a room with a device in one hand. Every layout bug
 * this project has had was invisible to every other layer, because jsdom has no
 * viewport: a page can be perfectly correct in the DOM and still be a blank
 * screen, or a column of controls running off the side of a 393px display.
 *
 * These run under a real device profile rather than a resized desktop, so touch
 * targets, the drawer and the media queries are the ones a judge gets.
 */

/**
 * Nothing may scroll sideways.
 *
 * Horizontal overflow is the classic phone failure: one wide table or one
 * unwrapped row, and the whole page slides under the thumb while the person is
 * trying to read it.
 */
async function expectNoSidewaysScroll(page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, "the page scrolls sideways on a phone").toBeLessThanOrEqual(1);
}

test("a judge can reach their cards through the drawer", async ({ page }) => {
  await signIn(page, judge(6));
  await goto(page, "/user/home");
  await expectPagePainted(page);
  await expectNoSidewaysScroll(page);

  // The desktop nav collapses to a drawer at this width. Its entries are
  // ListItemButtons, so they are buttons rather than links.
  await page.getByRole("button", { name: "Open menu" }).click();

  const judging = page.getByRole("button", { name: "Judging", exact: true });
  await expect(judging).toBeVisible({ timeout: 15_000 });
  await judging.click();

  await expect(page.getByText("First round")).toBeVisible({ timeout: 20_000 });
  await expectNoSidewaysScroll(page);
});

test("the score dialog is usable at phone width", async ({ page }) => {
  // opens a card without submitting, so it needs one nobody has scored
  await signIn(page, judge(7));
  await goto(page, "/user/judging");
  await expectPagePainted(page);

  const card = page.getByRole("button", { name: "Score team" }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // all five criteria reachable, and the submit button on screen rather than
  // somewhere below a scroll the person has to guess at
  await expect(dialog.locator(".MuiSelect-select")).toHaveCount(5);
  await expect(dialog.getByRole("button", { name: "Submit score" })).toBeVisible();
  await expectNoSidewaysScroll(page);

  await dialog.getByRole("button", { name: /cancel|close/i }).first().click();
});

test("the organizer pages do not run off the side of a phone", async ({ page }) => {
  await signIn(page, "admin");

  // the dense ones: a stats bar, a row list, and a tabbed settings page
  for (const path of ["/user/home", "/user/admin/judging", "/user/admin/control", "/user/admin/results"]) {
    await goto(page, path);
    await expectPagePainted(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSidewaysScroll(page);
  }
});

test("the public forms fit a phone, since that is how most people register", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Student registration")).toBeVisible();
  await expectNoSidewaysScroll(page);

  await goto(page, "/judge-registration");
  await expect(page.getByText("Judge and mentor sign-up")).toBeVisible();
  await expectNoSidewaysScroll(page);
});
