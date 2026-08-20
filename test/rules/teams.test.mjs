/**
 * /teams.
 *
 * The block that matters most here is the last one: a judge is granted read on
 * `teams/$teamId/submission` and on nothing else. A read granted at a child
 * never confers the parent, and this proves it rather than asserting it —
 * because if it did cascade upward, the grant would hand judges the team's
 * members and schedule too.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ref, get, set } from "firebase/database";
import { makeTestEnv, seed, baseWorld, assignment, finalAssignment } from "./helpers.mjs";

let testEnv;

beforeAll(async () => {
  testEnv = await makeTestEnv();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await seed(testEnv, baseWorld());
});

const db = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).database();

describe("reading a team", () => {
  test("a member can", async () => {
    await assertSucceeds(get(ref(db("alice"), "teams/team1")));
  });

  test("the creator can", async () => {
    await assertSucceeds(get(ref(db("alice"), "teams/team1")));
  });

  test("someone on another team cannot", async () => {
    await assertFails(get(ref(db("carol"), "teams/team1")));
  });

  test("nobody may list every team", async () => {
    await assertFails(get(ref(db("alice"), "teams")));
    await assertFails(get(ref(db("judge1"), "teams")));
  });

  test("an admin may", async () => {
    await assertSucceeds(get(ref(db("admin"), "teams")));
  });

  test("any signed-in user may read a team's name, to confirm an id before joining", async () => {
    await assertSucceeds(get(ref(db("carol"), "teams/team1/name")));
  });
});

describe("creating a team", () => {
  const newTeam = (extra = {}) => ({
    name: "Gamma",
    createdBy: "dave",
    members: { dave: true },
    ...extra,
  });

  test("a competitor can create one with themselves as creator and member", async () => {
    await assertSucceeds(set(ref(db("dave"), "teams/team3"), newTeam()));
  });

  test("but not one created by somebody else", async () => {
    await assertFails(set(ref(db("dave"), "teams/team3"), newTeam({ createdBy: "alice" })));
  });

  test("nor one they are not a member of", async () => {
    await assertFails(set(ref(db("dave"), "teams/team3"), newTeam({ members: { alice: true } })));
  });

  test("a judge who is not a competitor cannot create a team", async () => {
    await assertFails(
      set(ref(db("judge1"), "teams/team3"), {
        name: "Gamma",
        createdBy: "judge1",
        members: { judge1: true },
      })
    );
  });

  test("cannot seed a schedule", async () => {
    await assertFails(
      set(ref(db("dave"), "teams/team3"), newTeam({ schedule: assignment("team3") }))
    );
  });

  test("cannot seed a finalist slot", async () => {
    await assertFails(
      set(ref(db("dave"), "teams/team3"), newTeam({ finalSlot: { room: "R", timeslot: "S" } }))
    );
  });

  test("cannot overwrite an existing team", async () => {
    await assertFails(set(ref(db("dave"), "teams/team1"), newTeam()));
  });
});

describe("membership", () => {
  test("you can add yourself", async () => {
    await assertSucceeds(set(ref(db("dave"), "teams/team1/members/dave"), true));
  });

  test("and remove yourself", async () => {
    await assertSucceeds(set(ref(db("bob"), "teams/team1/members/bob"), null));
  });

  test("but not add anyone else", async () => {
    await assertFails(set(ref(db("alice"), "teams/team1/members/dave"), true));
  });

  test("and not remove anyone else", async () => {
    await assertFails(set(ref(db("alice"), "teams/team1/members/bob"), null));
  });
});

describe("the submission", () => {
  test("a member can write it", async () => {
    await assertSucceeds(
      set(ref(db("alice"), "teams/team1/submission"), { ideaName: "Revised" })
    );
  });

  test("a non-member cannot", async () => {
    await assertFails(
      set(ref(db("carol"), "teams/team1/submission"), { ideaName: "Sabotage" })
    );
  });

  test("a member can mark the team submitted", async () => {
    await assertSucceeds(set(ref(db("alice"), "teams/team1/submitted"), true));
  });

  test("a member cannot touch the schedule", async () => {
    await assertFails(set(ref(db("alice"), "teams/team1/schedule"), assignment("team1")));
  });
});

describe("a judge reads the submissions they are assigned", () => {
  test("an assigned judge can read the submission", async () => {
    await assertSucceeds(get(ref(db("judge1"), "teams/team1/submission")));
  });

  test("and its pitch deck link", async () => {
    await assertSucceeds(get(ref(db("judge1"), "teams/team1/submission/pitchDeckURL")));
  });

  test("an unassigned judge cannot", async () => {
    await assertFails(get(ref(db("judge2"), "teams/team1/submission")));
  });

  test("nor a judge assigned to a different team", async () => {
    await assertFails(get(ref(db("judge1"), "teams/team2/submission")));
  });

  test("a final-round assignment grants it too", async () => {
    const world = baseWorld();
    world.judges.judge2.finalAssignments = { team1: finalAssignment("team1") };
    await testEnv.clearDatabase();
    await seed(testEnv, world);

    await assertSucceeds(get(ref(db("judge2"), "teams/team1/submission")));
  });

  test("a competitor is not accidentally granted anything by that rule", async () => {
    await assertFails(get(ref(db("carol"), "teams/team1/submission")));
  });

  test("an assigned judge still cannot write the submission", async () => {
    await assertFails(set(ref(db("judge1"), "teams/team1/submission/ideaName"), "Mine now"));
  });
});

describe("the submission grant does not cascade upward", () => {
  // The proof that granting read on one child is safe. If it conferred the
  // parent, judge1 would hold the team's members, its schedule and its slot.
  test.each([
    ["the team node", "teams/team1"],
    ["its members", "teams/team1/members"],
    ["its schedule", "teams/team1/schedule"],
    ["its finalist slot", "teams/team1/finalSlot"],
    ["whether it submitted", "teams/team1/submitted"],
  ])("an assigned judge is still denied %s", async (_label, path) => {
    await assertFails(get(ref(db("judge1"), path)));
  });
});
