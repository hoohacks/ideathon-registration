import { test, expect } from "@playwright/test";
import { signIn, goto, expectPagePainted } from "./helpers.mjs";

/**
 * The most critical hour of the event: planning a schedule, publishing it, and
 * a judge seeing their cards.
 *
 * The seed builds an event that is already schedulable, so this exercises the
 * planner end to end -- build, look at it, publish -- and then checks that the
 * write actually reached the place a judge reads from, which is a different
 * node from the one the organizer was looking at.
 */

test("an organizer can build a plan, publish it, and a judge then has cards", async ({
  browser,
}) => {
  const organizer = await browser.newPage();
  await signIn(organizer, "admin");

  await goto(organizer, "/user/admin/schedule");
  await expectPagePainted(organizer);

  // Build is only offered when no draft is open; a previous run may have left
  // one, in which case the plan is already on screen.
  const build = organizer.getByRole("button", { name: /Build a plan|Build the plan/i });
  if (await build.isVisible().catch(() => false)) {
    await build.click();
  }

  // the stats bar above the grid is what tells you the plan exists
  await expect(organizer.getByRole("button", { name: /^Publish/i })).toBeVisible({
    timeout: 30_000,
  });

  await organizer.getByRole("button", { name: /^Publish/i }).click();

  // publishing asks for a typed confirmation whenever a schedule may exist
  const phrase = organizer.getByLabel(/type/i);
  if (await phrase.isVisible().catch(() => false)) {
    const expected = await organizer
      .getByText(/type .* to confirm/i)
      .textContent()
      .catch(() => null);
    const match = expected?.match(/type\s+(.+?)\s+to confirm/i);
    if (match) await phrase.fill(match[1].replace(/[“”"]/g, "").trim());
  }

  const confirm = organizer.getByRole("button", { name: /^(Publish|Confirm)/i }).last();
  await confirm.click();

  // publishing navigates to judging progress
  await expect(organizer).toHaveURL(/#\/user\/admin\/judging/, { timeout: 30_000 });
  await expectPagePainted(organizer);

  // ---- and now the judge's own copy, which is a different node entirely ----
  const judge = await browser.newPage();
  await signIn(judge, "judge");
  await goto(judge, "/user/judging");
  await expectPagePainted(judge);

  await expect(judge.getByText("First round")).toBeVisible();
  await expect(judge.getByText(/No assignments yet/)).toHaveCount(0);

  await organizer.close();
  await judge.close();
});

test("judging progress shows the first round, and the final round separately", async ({ page }) => {
  await signIn(page, "admin");
  await goto(page, "/user/admin/judging");
  await expectPagePainted(page);

  await expect(page.getByRole("heading", { name: "Judging progress" })).toBeVisible();

  // the final round is not a filtered view of the first: switching it used to
  // leave every submitted team on screen with its first-round room and panel
  // MUI renders a Select as a button carrying its current value, not a combobox
  await page.getByRole("button", { name: "First round" }).click();
  await page.getByRole("option", { name: "Final round" }).click();

  await expectPagePainted(page);
  await expect(page.getByText(/final round has not been activated|No judges have final/i).first())
    .toBeVisible();
});

test("a judge sees only their own page, not the organizer's", async ({ page }) => {
  await signIn(page, "judge");

  await goto(page, "/user/admin/control");
  // a judge is bounced rather than shown a broken page
  await expect(page).not.toHaveURL(/#\/user\/admin\/control/);
  await expectPagePainted(page);
});
