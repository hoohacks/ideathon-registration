import { expect } from "@playwright/test";

/**
 * The seeded accounts. `npm run seed` creates all of them with one password;
 * `test:e2e` runs the seed before Playwright starts.
 */
export const ACCOUNTS = {
  admin: { email: "admin@example.com", password: "testtest" },
  judge: { email: "judge1@example.com", password: "testtest" },
  competitor: { email: "competitor1@example.com", password: "testtest" },
};

/**
 * The app is a HashRouter, so every route lives after a `#`.
 *
 * Writing that out in each spec is how the wrong URL gets normalised into the
 * tests as well as the app -- `/judge-registration` without the hash silently
 * served the competitor form for weeks.
 */
export const route = (path) => `/#${path.startsWith("/") ? path : `/${path}`}`;

export async function goto(page, path) {
  await page.goto(route(path));
}

/** Sign in and wait until the app has resolved a role, not just the form. */
export async function signIn(page, who) {
  const { email, password } = ACCOUNTS[who] ?? who;

  await goto(page, "/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  await expect(page).toHaveURL(/#\/user\//, { timeout: 20_000 });
}

/**
 * Nothing in the app should ever render an empty page.
 *
 * A blank screen has meant three different things in this project -- a thrown
 * render, a wrong URL, and a page pushed below the fold -- so every spec checks
 * for it rather than only for the thing it came to test.
 */
export async function expectPagePainted(page) {
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByText(/Something went wrong on this page/)).toHaveCount(0);
}

/** The emulator endpoints. Same hosts the seed script and the rules tests use. */
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts";
const DB = "http://127.0.0.1:9000";
const NS = "demo-ideathon";

/**
 * A competitor who is not on a team yet.
 *
 * Every seeded competitor is already on one, and the join page redirects anyone
 * who has a `teamId` straight to their team -- so a join can only be exercised
 * by somebody new. Created straight through the emulator REST APIs rather than
 * the registration form, so this spec fails for join reasons and not for
 * whatever the registration form happens to require this month.
 */
export async function createTeamlessCompetitor(request) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = "testtest";

  const signUp = await request.post(`${AUTH}:signUp?key=fake-api-key`, {
    data: { email, password, returnSecureToken: true },
  });
  if (!signUp.ok()) throw new Error(`could not create an account: ${await signUp.text()}`);
  const { localId } = await signUp.json();

  const record = await request.put(`${DB}/competitors/${localId}.json?ns=${NS}`, {
    data: {
      firstName: "E2E",
      lastName: "Competitor",
      email,
      major: "CS",
      checkedIn: false,
      foodCheckIn: false,
    },
  });
  if (!record.ok()) throw new Error(`could not write the competitor record`);

  return { email, password, uid: localId };
}

/** A team somebody can join, or one that is closed. */
export async function createTeam(request, { name, submitted = false }) {
  const teamId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const res = await request.put(`${DB}/teams/${teamId}.json?ns=${NS}`, {
    data: { name, submitted, createdBy: "e2e" },
  });
  if (!res.ok()) throw new Error("could not create the team");
  return teamId;
}
