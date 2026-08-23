/**
 * /adminLog.
 *
 * The log exists so an overwrite on event day can be traced; RTDB keeps no
 * history of its own. It is NOT tamper-proof — admins hold root write and
 * deletes skip validation — so these tests pin the shape and the author, which
 * are the parts rules can actually enforce.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ref, get, set } from "firebase/database";
import { makeTestEnv, seed, baseWorld, scoreCard } from "./helpers.mjs";

let testEnv;

beforeAll(async () => { testEnv = await makeTestEnv(); });
afterAll(async () => { await testEnv?.cleanup(); });
beforeEach(async () => {
  await testEnv.clearDatabase();
  await seed(testEnv, baseWorld());
});

const db = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).database();

const entry = (overrides = {}) => ({
  at: Date.now() - 1000,
  by: "admin",
  byName: "An Organiser",
  action: "room.remove",
  summary: "Removed Rice 110",
  undoable: true,
  changes: [{ path: "config/judgingRooms", before: '["Rice 110"]', after: "[]" }],
  ...overrides,
});

describe("who can see the log", () => {
  test("an admin may read it", async () => {
    await assertSucceeds(get(ref(db("admin"), "adminLog")));
  });

  test("a competitor may not", async () => {
    await assertFails(get(ref(db("alice"), "adminLog")));
  });

  test("a judge may not", async () => {
    await assertFails(get(ref(db("judge1"), "adminLog")));
  });

  test("signed out may not", async () => {
    await assertFails(get(ref(db(null), "adminLog")));
  });
});

describe("what an entry may contain", () => {
  test("an admin writes a well-formed entry", async () => {
    await assertSucceeds(set(ref(db("admin"), "adminLog/e1"), entry()));
  });

  test("a non-admin cannot write one at all", async () => {
    await assertFails(set(ref(db("judge1"), "adminLog/e1"), entry({ by: "judge1" })));
  });

  test("the author is pinned to the caller, so it cannot be forged", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({ by: "judge1" })));
  });

  test("an unknown key is rejected", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({ sneaky: true })));
  });

  test("a missing required field is rejected", async () => {
    const withoutSummary = entry();
    delete withoutSummary.summary;
    await assertFails(set(ref(db("admin"), "adminLog/e1"), withoutSummary));
  });

  test("a future timestamp is rejected", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({ at: Date.now() + 600000 })));
  });

  test("a non-string before/after is rejected", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({
      changes: [{ path: "config/judgingRooms", before: ["Rice 110"], after: [] }],
    })));
  });

  test("an unknown key inside a change is rejected", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({
      changes: [{ path: "config/x", before: "1", after: "2", extra: "no" }],
    })));
  });
});

describe("why score deletes are not undoable", () => {
  /**
   * enteredBy is pinned to auth.uid — that is where "a judge cannot file under
   * another judge" lives. So restoring a deleted card is impossible for anyone
   * but its original author, which is why dangerZone marks score deletes
   * undoable:false and re-entry goes through PaperScoreDialog instead.
   */
  test("an admin cannot restore a card another admin entered", async () => {
    await assertFails(
      set(ref(db("admin"), "scores/first/team2/judge2"),
        scoreCard({ judgeUid: "judge2", teamId: "team2", enteredBy: "someone-else" }))
    );
  });
});
