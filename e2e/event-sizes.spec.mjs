import { test, expect } from "@playwright/test";
import { signIn, goto, expectPagePainted, clearFirstRoundScores, judge } from "./helpers.mjs";

/**
 * The judging day at the edges of what the event could be: one team in one
 * room, or a hundred and fifty teams across fifty.
 *
 * The rest of the suite runs against one seeded event of eight teams. The
 * scheduling arithmetic is swept over thousands of sizes in the unit tests,
 * but only here does a real browser build, publish and score at those sizes,
 * through the real rules -- which is where a page that takes too long to
 * render, or a write too large for one update, would show.
 *
 * Seeded and run by `npm run test:e2e:tiny` and `npm run test:e2e:large`, and
 * skipped otherwise, since every other spec expects the default seed.
 *
 * After each step the database itself is read back and checked, rather than
 * the screen: at 150 teams the screen cannot be read exhaustively, and the
 * database is what every judge and team will be shown.
 */

const SIZE = process.env.E2E_EVENT_SIZE;
const ROUND_ONE_JUDGES = Number(process.env.E2E_ROUND_ONE_JUDGES ?? 0);
test.skip(!SIZE, "run through npm run test:e2e:tiny or test:e2e:large");

// one shared schedule: these steps build on each other
test.describe.configure({ mode: "serial" });

const DB = "http://127.0.0.1:9000";
const NS = "demo-ideathon-default-rtdb";
const ADMIN = { Authorization: "Bearer owner" };

async function read(request, path) {
  const res = await request.get(`${DB}/${path}.json?ns=${NS}`, { headers: ADMIN });
  expect(res.ok(), `read ${path}`).toBe(true);
  return (await res.json()) ?? {};
}

/** Every rule a published first round has to keep, checked on the stored data. */
function scheduleViolations({ teams, judges, config }) {
  const broken = [];
  const rooms = new Set(config.judgingRooms ?? []);
  const roomInBatch = new Map();
  const judgeInBatch = new Map();
  const panels = {};

  for (const [teamId, team] of Object.entries(teams)) {
    const slot = team.schedule;
    if (!team.submitted) {
      if (slot) broken.push(`${teamId} did not submit but has a slot`);
      continue;
    }
    if (!slot) {
      broken.push(`${teamId} submitted but has no slot`);
      continue;
    }
    if (!rooms.has(slot.room)) broken.push(`${teamId} is in ${slot.room}, not a configured room`);
    const key = `${slot.batch}::${slot.room}`;
    if (roomInBatch.has(key)) broken.push(`${teamId} and ${roomInBatch.get(key)} share ${slot.room} in batch ${slot.batch}`);
    roomInBatch.set(key, teamId);

    const roster = Object.values(slot.judges ?? {});
    if (!roster.length) broken.push(`${teamId} has no judge`);
    panels[teamId] = new Set(roster.map((j) => j.judgeId));
    for (const { judgeId } of roster) {
      const where = `${slot.batch}::${judgeId}`;
      if (judgeInBatch.has(where)) broken.push(`${judgeId} is in two rooms in batch ${slot.batch}`);
      judgeInBatch.set(where, teamId);
      if (!judges[judgeId]?.isRound1Judge) broken.push(`${judgeId} on ${teamId} is not a round-one judge`);
    }
  }

  // every judge's own list is the same schedule seen from the other side
  for (const [judgeId, j] of Object.entries(judges)) {
    for (const [teamId, card] of Object.entries(j.teamAssignments ?? {})) {
      if (!panels[teamId]?.has(judgeId)) broken.push(`${judgeId} has a card for ${teamId} but is not on its panel`);
      if (card.room !== teams[teamId]?.schedule?.room) broken.push(`${judgeId}'s card for ${teamId} names the wrong room`);
    }
  }
  for (const [teamId, panel] of Object.entries(panels)) {
    for (const judgeId of panel) {
      if (!judges[judgeId]?.teamAssignments?.[teamId]) broken.push(`${judgeId} is on ${teamId}'s panel with no card for it`);
    }
  }
  return broken;
}

/** Wait for the page to stop loading, and say how long that took. */
async function timed(fn) {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}

async function noSidewaysScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(1);
}

test("an organizer builds and publishes the first round, and every slot lands correctly", async ({ page, request }) => {
  test.setTimeout(240_000);
  await clearFirstRoundScores(request);

  await signIn(page, "admin");
  await goto(page, "/user/admin/schedule");
  await expectPagePainted(page);

  const build = page.getByRole("button", { name: "Build a plan" });
  const publish = page.getByRole("button", { name: "Publish schedule" });
  await expect(build.or(publish).first()).toBeVisible({ timeout: 60_000 });
  if (await build.isVisible()) {
    const ms = await timed(async () => {
      await build.click();
      await expect(publish).toBeVisible({ timeout: 90_000 });
    });
    test.info().annotations.push({ type: "build", description: `${ms} ms` });
  }
  await expectPagePainted(page);
  await noSidewaysScroll(page);

  await publish.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Publish this schedule/ })).toBeVisible();
  // the typed phrase is only asked for when a schedule might already exist
  const prompt = dialog.getByText(/Type\s+".+?"\s+to confirm/).first();
  if (await prompt.count()) {
    const phrase = ((await prompt.textContent()) ?? "").match(/Type\s+"(.+?)"\s+to confirm/)?.[1];
    await dialog.getByRole("textbox").fill(phrase ?? "");
  }
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page).toHaveURL(/#\/user\/admin\/judging/, { timeout: 90_000 });
  await expectPagePainted(page);

  const world = {
    teams: await read(request, "teams"),
    judges: await read(request, "judges"),
    config: await read(request, "config"),
  };
  expect(scheduleViolations(world)).toEqual([]);
});

test("a judge sees their cards and scores one", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signIn(page, judge(1));
  await goto(page, "/user/judging");
  await expectPagePainted(page);
  await noSidewaysScroll(page);

  const judges = await read(request, "judges");
  const me = Object.entries(judges).find(([, j]) => j.email === "judge1@example.com");
  const cards = Object.keys(me[1].teamAssignments ?? {});
  expect(cards.length, "judge 1 has no first-round cards").toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Score team" })).toHaveCount(cards.length, { timeout: 30_000 });

  await page.getByRole("button", { name: "Score team" }).first().click();
  const dialog = page.getByRole("dialog");
  const selects = dialog.locator(".MuiSelect-select");
  await expect(selects).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await selects.nth(i).click();
    await page.getByRole("option", { name: "5", exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Yes" }).click();
  await dialog.getByRole("button", { name: "Submit score" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const scores = await read(request, "scores/first");
  const filed = Object.entries(scores).filter(([, byJudge]) => byJudge[me[0]]);
  expect(filed).toHaveLength(1);
  expect(cards).toContain(filed[0][0]);
});

test("the final round is cut, published and handed to every judge in the room", async ({ page, request }) => {
  test.setTimeout(240_000);

  // every panel scores its team, so the whole event is ranked
  const teams = await read(request, "teams");
  const cards = {};
  Object.entries(teams).forEach(([teamId, team], index) => {
    for (const { judgeId } of Object.values(team.schedule?.judges ?? {})) {
      const value = 1 + ((index * 7 + judgeId.length) % 10);
      cards[`${teamId}/${judgeId}`] = {
        problem: value, innovation: value, impact: value,
        viability: Math.ceil(value / 2), pitch_quality: Math.ceil(value / 2),
        fundable: value > 5, judgeUid: judgeId, teamId, enteredBy: judgeId, submittedAt: Date.now(),
      };
    }
  });
  const res = await request.patch(`${DB}/scores/first.json?ns=${NS}`, { headers: ADMIN, data: cards });
  expect(res.ok()).toBe(true);

  await signIn(page, "admin");
  await goto(page, "/user/admin/schedule?round=final");
  await expectPagePainted(page);
  const build = page.getByRole("button", { name: "Build a final round plan" });
  const publish = page.getByRole("button", { name: "Publish the final round" });
  await expect(build.or(publish).first()).toBeVisible({ timeout: 60_000 });
  if (await build.isVisible()) await build.click();
  await expect(page.getByText("Slot 1")).toBeVisible({ timeout: 60_000 });
  await noSidewaysScroll(page);

  await publish.click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Final round published/i)).toBeVisible({ timeout: 90_000 });

  const after = {
    teams: await read(request, "teams"),
    judges: await read(request, "judges"),
    finalRound: await read(request, "finalRound"),
  };
  const finalists = Object.keys(after.finalRound.teams ?? {}).sort();
  const submitted = Object.values(after.teams).filter((t) => t.submitted).length;
  expect(finalists).toHaveLength(Math.min(4, submitted));

  const broken = [];
  for (const [teamId, team] of Object.entries(after.teams)) {
    if (finalists.includes(teamId) !== Boolean(team.finalSlot)) broken.push(`${teamId}'s final slot is wrong`);
  }
  // the final round is open to every checked-in judge, and the seed checks
  // everyone in
  for (const [uid, j] of Object.entries(after.judges)) {
    const got = Object.keys(j.finalAssignments ?? {}).sort();
    const want = j.checkedIn ? finalists : [];
    if (got.join() !== want.join()) broken.push(`${uid} has final cards for ${got}, expected ${want}`);
  }
  expect(broken).toEqual([]);

  // and a final-round-only judge, who had nothing in round one, sees them
  const prof = await page.context().browser().newPage();
  await signIn(prof, judge(ROUND_ONE_JUDGES + 1));
  await goto(prof, "/user/judging");
  await expectPagePainted(prof);
  await expect(prof.getByRole("heading", { name: "Final round" })).toBeVisible({ timeout: 30_000 });
  await expect(prof.getByRole("button", { name: "Score team" })).toHaveCount(finalists.length, { timeout: 30_000 });
  await prof.close();
});

test("judging progress, results and the room sheets load at this size", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signIn(page, "admin");

  for (const path of ["/user/admin/judging", "/user/admin/results"]) {
    const ms = await timed(async () => {
      await goto(page, path);
      await expectPagePainted(page);
      await expect(page.getByRole("main")).not.toBeEmpty({ timeout: 60_000 });
    });
    test.info().annotations.push({ type: path, description: `${ms} ms` });
    await noSidewaysScroll(page);
  }

  // the room sheets are made for paper, so there is no nav to wait for: one
  // sheet per room in use is the assertion
  const teams = await read(request, "teams");
  const roomsInUse = new Set(Object.values(teams).map((t) => t.schedule?.room).filter(Boolean));
  await goto(page, "/user/admin/print");
  await expect(page.getByRole("heading", { level: 1, name: "Room sheets" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(roomsInUse.size, { timeout: 60_000 });
});
