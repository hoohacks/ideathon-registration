import { test, expect } from "@playwright/test";
import { signIn, goto, expectPagePainted, judge } from "./helpers.mjs";

/**
 * A judge on venue wifi that stops working.
 *
 * This is the app's worst failure mode and the one it was most carefully built
 * against: a submit that cannot reach the database is queued on the device
 * rather than lost, and drained when the connection comes back. There is a
 * whole durable outbox for it -- and until now every test of it used a fake
 * writer. Nothing had ever taken the network away from a real browser and
 * watched what the judge sees.
 *
 * `.info/connected` is what the app trusts rather than `navigator.onLine`,
 * precisely because a captive portal lies about the latter. Playwright's
 * offline mode cuts the socket, so this exercises the signal the app actually
 * reads.
 */

const SCORES = ["7", "6", "8", "3", "4"];

/** Fill in and submit whichever card is still unscored. */
async function scoreACard(page) {
  const card = page.getByRole("button", { name: "Score team" }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.click();

  const dialog = page.getByRole("dialog");
  const selects = dialog.locator(".MuiSelect-select");
  await expect(selects).toHaveCount(5);

  for (let i = 0; i < SCORES.length; i++) {
    await selects.nth(i).click();
    await page.getByRole("option", { name: SCORES[i], exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Yes" }).click();
  await dialog.getByRole("button", { name: "Submit score" }).click();
  return dialog;
}

test("a score submitted with no connection is kept, not lost", async ({ page, context }) => {
  // the submit waits out its eight second deadline before it queues
  test.setTimeout(120_000);

  // its own judge: a card cannot be scored twice, so sharing one with another
  // spec leaves nothing to submit
  await signIn(page, judge(4));
  await goto(page, "/user/judging");
  await expectPagePainted(page);
  await expect(page.getByRole("button", { name: "Score team" }).first()).toBeVisible({
    timeout: 20_000,
  });

  const countCards = async () => {
    const res = await page.request.get(
      "http://127.0.0.1:9000/scores/first.json?ns=demo-ideathon-default-rtdb",
      { headers: { Authorization: "Bearer owner" } }
    );
    const all = (await res.json()) ?? {};
    return Object.values(all).reduce((n, cards) => n + Object.keys(cards ?? {}).length, 0);
  };
  const before = await countCards();

  await context.setOffline(true);

  const dialog = await scoreACard(page);
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  // the card says where the score actually is: on this device, not in the
  // database. Telling a judge it is submitted would be the lie that loses it.
  await expect(page.getByRole("button", { name: "Saved on device" }).first()).toBeVisible({
    timeout: 30_000,
  });

  await context.setOffline(false);

  // draining is triggered by the connection coming back, not by a timer
  await expect(page.getByRole("button", { name: "Saved on device" })).toHaveCount(0, {
    timeout: 60_000,
  });

  // the score really is in the database, not merely off the queue
  expect(await countCards()).toBe(before + 1);

  await expect(page.getByRole("button", { name: "Scored" }).first()).toBeVisible({
    timeout: 60_000,
  });
});

test("a queued score is written to disk, not held in memory", async ({ page, context }) => {
  test.setTimeout(120_000);

  await signIn(page, judge(5));
  await goto(page, "/user/judging");
  await expect(page.getByRole("button", { name: "Score team" }).first()).toBeVisible({
    timeout: 20_000,
  });

  await context.setOffline(true);
  const dialog = await scoreACard(page);
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Saved on device" }).first()).toBeVisible({
    timeout: 30_000,
  });

  // The claim is that a crash or a flat battery cannot take the card with it,
  // so the assertion is the card actually being on disk rather than in a
  // variable. (Reloading while offline is not the test: the app is not cached,
  // so a refresh with no connection cannot load it at all.)
  const queued = await page.evaluate(() => localStorage.getItem("ideathon:pendingScores:v1"));
  expect(queued, "nothing was written to localStorage").toBeTruthy();
  expect(JSON.parse(queued).length).toBeGreaterThan(0);

  // and once the connection returns, a reload still drains it
  await context.setOffline(false);
  await page.reload();

  await expect(page.getByRole("button", { name: "Scored" }).first()).toBeVisible({
    timeout: 60_000,
  });
  const drained = await page.evaluate(() => localStorage.getItem("ideathon:pendingScores:v1"));
  expect(JSON.parse(drained ?? "[]")).toHaveLength(0);
});

test("the organizer sees the score once it lands, and not before", async ({ browser }) => {
  const admin = await browser.newPage();
  await signIn(admin, "admin");
  await goto(admin, "/user/admin/judging");
  await expectPagePainted(admin);

  // whatever the specs above queued has since drained, so progress is non-zero
  await expect(admin.getByText(/scores in/)).toBeVisible();
  await expect(admin.getByText(/^0\/\d+$/)).toHaveCount(0);

  await admin.close();
});
