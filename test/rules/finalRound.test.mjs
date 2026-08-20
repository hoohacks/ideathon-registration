/**
 * /finalRound — the standings leak.
 *
 * The node used to carry `".read": "auth != null"`, so every signed-in account
 * — including every competitor still waiting to hear the result — could read
 * the top four teams with their numeric average scores before they were
 * announced. The single most important assertion in this file is that a
 * competitor is now denied on /finalRound itself.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ref, get, set } from "firebase/database";
import { makeTestEnv, seed, baseWorld, finalAssignment } from "./helpers.mjs";

let testEnv;

beforeAll(async () => {
  testEnv = await makeTestEnv();
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const db = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).database();

/** A world with the final round live, as activateFinalRound leaves it. */
function activatedWorld() {
  const world = baseWorld();

  world.finalRound = {
    active: true,
    activatedAt: Date.now(),
    activatedBy: "admin",
    teams: {
      team1: {
        name: "Alpha",
        averageScore: 34.2,
        fundableVotes: 2,
        judgeCount: 2,
        excludedJudges: { judge1: true },
        timeslot: "Slot 1",
        room: "Rice 011",
      },
    },
  };

  world.teams.team1.finalSlot = { room: "Rice 011", timeslot: "Slot 1" };
  world.judges.judge2.finalAssignments = { team1: finalAssignment("team1") };

  return world;
}

beforeEach(async () => {
  await testEnv.clearDatabase();
  await seed(testEnv, activatedWorld());
});

describe("the standings are private", () => {
  test.each([
    ["a competitor on a finalist team", "alice"],
    ["a competitor on another team", "carol"],
    ["a judge", "judge1"],
    ["a judge with final assignments", "judge2"],
  ])("%s is denied /finalRound", async (_label, uid) => {
    await assertFails(get(ref(db(uid), "finalRound")));
  });

  test.each([
    ["a competitor", "alice"],
    ["a judge", "judge2"],
  ])("%s is denied the standings themselves", async (_label, uid) => {
    await assertFails(get(ref(db(uid), "finalRound/teams")));
  });

  test("nor one team's entry, which carries its average", async () => {
    await assertFails(get(ref(db("alice"), "finalRound/teams/team1")));
    await assertFails(get(ref(db("alice"), "finalRound/teams/team1/averageScore")));
  });

  test("nor who activated it", async () => {
    await assertFails(get(ref(db("alice"), "finalRound/activatedBy")));
  });

  test("an admin can read all of it", async () => {
    await assertSucceeds(get(ref(db("admin"), "finalRound")));
  });
});

describe("what everyone is allowed to know", () => {
  test.each([
    ["active", "finalRound/active"],
    ["activatedAt", "finalRound/activatedAt"],
  ])("any signed-in user may read %s", async (_label, path) => {
    await assertSucceeds(get(ref(db("alice"), path)));
    await assertSucceeds(get(ref(db("judge1"), path)));
  });

  test("but not while signed out", async () => {
    await assertFails(get(ref(db(null), "finalRound/active")));
  });

  test("nobody but an admin can flip the switch", async () => {
    await assertFails(set(ref(db("judge1"), "finalRound/active"), false));
    await assertFails(set(ref(db("alice"), "finalRound/active"), false));
    await assertSucceeds(set(ref(db("admin"), "finalRound/active"), false));
  });
});

describe("a finalist team sees its own slot", () => {
  // this is what the denormalisation buys: the team learns its room and time
  // through the team read it already holds, without the standings coming with it
  test("a member reads their own finalSlot", async () => {
    await assertSucceeds(get(ref(db("alice"), "teams/team1/finalSlot")));
  });

  test("but not another team's", async () => {
    await assertFails(get(ref(db("carol"), "teams/team1/finalSlot")));
  });

  test("and cannot write their own", async () => {
    await assertFails(
      set(ref(db("alice"), "teams/team1/finalSlot"), { room: "Best room", timeslot: "Slot 1" })
    );
  });

  test("an admin cannot smuggle a score into it", async () => {
    // $other: false is what makes it structurally impossible for a later change
    // to activateFinalRound to copy averageScore into a member-readable node
    await assertFails(
      set(ref(db("admin"), "teams/team1/finalSlot"), {
        room: "Rice 011",
        timeslot: "Slot 1",
        averageScore: 34.2,
      })
    );
  });

  test("an admin writing a well-formed slot succeeds", async () => {
    await assertSucceeds(
      set(ref(db("admin"), "teams/team1/finalSlot"), { room: "Rice 011", timeslot: "Slot 2" })
    );
  });
});

describe("a judge sees only their own final assignments", () => {
  test("reads their own", async () => {
    await assertSucceeds(get(ref(db("judge2"), "judges/judge2/finalAssignments")));
  });

  test("not another judge's", async () => {
    await assertFails(get(ref(db("judge1"), "judges/judge2/finalAssignments")));
  });

  test("and cannot hand themselves one", async () => {
    // the /scores rule treats this node as proof of assignment, so a judge who
    // could write it could file a final-round score for any team
    await assertFails(
      set(ref(db("judge1"), "judges/judge1/finalAssignments"), {
        team1: finalAssignment("team1"),
      })
    );
  });

  test("an admin can", async () => {
    await assertSucceeds(
      set(ref(db("admin"), "judges/judge1/finalAssignments"), {
        team1: finalAssignment("team1"),
      })
    );
  });

  test("a final assignment must not carry an average score", async () => {
    await assertFails(
      set(ref(db("admin"), "judges/judge1/finalAssignments/team1"), {
        ...finalAssignment("team1"),
        averageScore: 34.2,
      })
    );
  });
});
