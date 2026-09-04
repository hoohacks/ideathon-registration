import { test, expect } from "@playwright/test";
import { signIn, goto, expectPagePainted, createTeamlessCompetitor, createTeam } from "./helpers.mjs";

/** A minimal PDF, enough for the upload the form insists on. */
const DECK = {
  name: "pitch.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 minimal fixture, never opened by anything"),
};

/**
 * A team writing the thing the judges read.
 *
 * The submission is the only content a competitor produces, and the schedule is
 * built from teams that have one -- so a broken save is a team that never gets
 * judged. It also flips `submitted`, which closes the team to new members, so
 * this is the write that the join rule keys off.
 *
 * The seeded teams have already submitted, and the form is read-only after
 * that, so this builds its own team to have something unsubmitted to work with.
 */

test("a team can write and save its pitch, which then closes the team", async ({ page, request }) => {
  const person = await createTeamlessCompetitor(request);
  const teamId = await createTeam(request, { name: "E2E Pitch Team" });

  await signIn(page, person);
  await goto(page, "/user/team/join");
  await page.getByLabel("Team ID").fill(teamId);
  await page.getByRole("button", { name: /join/i }).click();

  await expect(page).toHaveURL(/#\/user\/team/, { timeout: 20_000 });
  await expectPagePainted(page);
  await expect(page.getByText("E2E Pitch Team").first()).toBeVisible();

  // an unsubmitted team gets the form rather than the read-only summary
  await page.getByLabel("Idea name").fill("Wayfinder");
  await page.getByLabel("Problem statement").fill(
    "Students cannot find an accessible route between buildings during construction."
  );
  await page.getByLabel("Target industry").fill("Civic technology");

  // the form refuses without a deck, which is the judges' reading material
  await page.locator('input[type="file"]').setInputFiles(DECK);
  await expect(page.getByText(/pitch\.pdf/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Save submission" }).click();

  // saving confirms in a dialog before it hands the page back
  await page.getByRole("button", { name: "Done" }).click();


  // The form stays editable until a schedule is published -- a team may revise
  // its pitch right up to that point -- so the receipt is the saved values
  // being in the fields, not a summary replacing them. An input's value is not
  // text on the page, which is why this is toHaveValue and not getByText.
  await expect(page.getByLabel("Idea name")).toHaveValue("Wayfinder", { timeout: 20_000 });

  await page.reload();
  await expect(page.getByLabel("Idea name")).toHaveValue("Wayfinder", { timeout: 20_000 });
  await expect(page.getByLabel("Target industry")).toHaveValue("Civic technology");
});

test("a submitted team is closed to anyone else joining", async ({ page, request, browser }) => {
  const owner = await createTeamlessCompetitor(request);
  const teamId = await createTeam(request, { name: "E2E Closing Team" });

  await signIn(page, owner);
  await goto(page, "/user/team/join");
  await page.getByLabel("Team ID").fill(teamId);
  await page.getByRole("button", { name: /join/i }).click();
  await expect(page).toHaveURL(/#\/user\/team/, { timeout: 20_000 });

  await page.getByLabel("Idea name").fill("Closed Idea");
  await page.getByLabel("Problem statement").fill("Enough of a problem statement to submit.");
  // all three are required, and the handler refuses without them
  await page.getByLabel("Target industry").fill("Logistics");
  await page.locator('input[type="file"]').setInputFiles(DECK);
  await expect(page.getByText(/pitch\.pdf/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Save submission" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Idea name")).toHaveValue("Closed Idea", { timeout: 20_000 });

  // now somebody else tries the same id -- the rules refuse the write, and the
  // app has to turn that into a sentence rather than "please try again"
  const latecomer = await browser.newPage();
  const other = await createTeamlessCompetitor(request);
  await signIn(latecomer, other);
  await goto(latecomer, "/user/team/join");
  await latecomer.getByLabel("Team ID").fill(teamId);
  await latecomer.getByRole("button", { name: /join/i }).click();

  await expect(latecomer.getByText(/already submitted/i)).toBeVisible({ timeout: 20_000 });
  await latecomer.close();
});
