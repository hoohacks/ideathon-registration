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

  // The planner loads its draft asynchronously, so probing for a button before
  // it has rendered races the page and silently does nothing. Wait for whichever
  // state the page settles into: a draft already open, or the build prompt.
  const build = organizer.getByRole("button", { name: "Build a plan" });
  const publish = organizer.getByRole("button", { name: "Publish schedule" });

  await expect(build.or(publish).first()).toBeVisible({ timeout: 30_000 });
  if (await build.isVisible()) await build.click();

  await expect(publish).toBeVisible({ timeout: 30_000 });
  await publish.click();

  // Publishing over an existing schedule asks for a typed phrase: the event
  // name if one is set, the team count otherwise. Read it off the field rather
  // than assuming, because it changes with the data.
  const dialog = organizer.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Publish this schedule/ })).toBeVisible();

  const field = dialog.getByRole("textbox");
  // the prompt is a label, not an aria-label, so read what is on screen
  const prompt = (await dialog.getByText(/Type\s+".+?"\s+to confirm/).first().textContent()) ?? "";
  const phrase = prompt.match(/Type\s+"(.+?)"\s+to confirm/)?.[1];
  expect(phrase, `could not read the confirmation phrase from "${prompt}"`).toBeTruthy();

  const confirm = dialog.getByRole("button", { name: "Publish", exact: true });
  await expect(confirm).toBeDisabled();

  await field.fill(phrase);
  await expect(confirm).toBeEnabled();
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

test("the typed phrase is the guard: a wrong one cannot publish", async ({ page }) => {
  await signIn(page, "admin");
  await goto(page, "/user/admin/schedule");

  const build = page.getByRole("button", { name: "Build a plan" });
  const publish = page.getByRole("button", { name: "Publish schedule" });

  await expect(build.or(publish).first()).toBeVisible({ timeout: 30_000 });
  if (await build.isVisible()) await build.click();

  await publish.click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("not the phrase");
  await expect(dialog.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
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
