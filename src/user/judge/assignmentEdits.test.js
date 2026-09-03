/**
 * Moving one judge, on the day.
 *
 * This is what an organizer reaches for when a judge does not turn up -- the
 * single most likely thing to go wrong -- and it had no tests at all.
 *
 * The invariant that matters is the fan-out. An assignment is stored twice, at
 * `teams/{id}/schedule` and at `judges/{uid}/teamAssignments/{id}`, because a
 * judge cannot read /teams. Each judge's copy carries the whole roster for that
 * team, so changing one judge means rewriting the copy held by every other
 * judge on it. Miss one and that judge's card shows a panel that no longer
 * exists, on a phone, in a corridor, with no way to tell it is stale.
 */
jest.mock("../../firebase", () => ({ database: {} }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const mockGet = jest.fn();
const mockUpdate = jest.fn();

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
}));

const {
  assignJudgeToTeam, unassignJudgeFromTeam, swapJudges, findConflict,
} = require("./assignmentEdits");

const judge = (first) => ({ firstName: first, lastName: "J", isRound1Judge: true });

const schedule = (judges) => ({
  teamName: "Lumen",
  id: "t1",
  room: "Rice 110",
  time: "5:00 PM",
  batch: 1,
  judges,
});

const JUDGES = { j1: judge("Ada"), j2: judge("Alan"), j3: judge("Grace") };

const snap = (value) => ({ exists: () => value !== null && value !== undefined, val: () => value });
const payload = () => mockUpdate.mock.calls.at(-1)[1];

/** The two nodes these functions read, and nothing else. */
function world({ roster = [{ judgeId: "j1", judgeName: "Ada J" }], assignments = {} } = {}) {
  mockGet.mockImplementation(async ({ path }) => {
    if (path === "teams/t1/schedule") return snap(schedule(roster));
    if (path === "judges") return snap(JUDGES);
    if (path.startsWith("judges/") && path.endsWith("/teamAssignments")) {
      const uid = path.split("/")[1];
      return snap(assignments[uid] ?? null);
    }
    return snap(null);
  });
}

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
});

describe("adding a judge", () => {
  test("writes the team roster and every judge's copy of it", async () => {
    world({ roster: [{ judgeId: "j1", judgeName: "Ada J" }] });
    const result = await assignJudgeToTeam({ judgeUid: "j2", teamId: "t1" });

    expect(result.ok).toBe(true);
    const p = payload();
    expect(p["teams/t1/schedule/judges"].map((j) => j.judgeId)).toEqual(["j1", "j2"]);
    // the judge already on the team must see the new panel too
    expect(p["judges/j1/teamAssignments/t1"].judges.map((j) => j.judgeId)).toEqual(["j1", "j2"]);
    expect(p["judges/j2/teamAssignments/t1"].judges.map((j) => j.judgeId)).toEqual(["j1", "j2"]);
  });

  test("the judge copy carries what their card renders", async () => {
    world();
    await assignJudgeToTeam({ judgeUid: "j2", teamId: "t1" });

    const copy = payload()["judges/j2/teamAssignments/t1"];
    expect(copy.teamName).toBe("Lumen");
    expect(copy.id).toBe("t1");
    expect(copy.room).toBe("Rice 110");
    expect(copy.time).toBe("5:00 PM");
    expect(copy.batch).toBe(1);
  });

  test("everything lands in ONE update, so it cannot half-apply", async () => {
    world();
    await assignJudgeToTeam({ judgeUid: "j2", teamId: "t1" });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  test("a judge already on the team is a no-op, not a duplicate", async () => {
    world({ roster: [{ judgeId: "j1", judgeName: "Ada J" }] });
    const result = await assignJudgeToTeam({ judgeUid: "j1", teamId: "t1" });

    expect(result.unchanged).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("a judge booked elsewhere in the same batch is refused, and the clash is named", async () => {
    world({
      assignments: {
        j2: { t9: { id: "t9", teamName: "Kestrel", room: "Rice 011", time: "5:00 PM", batch: 1 } },
      },
    });
    const result = await assignJudgeToTeam({ judgeUid: "j2", teamId: "t1" });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Rice 011/);
    expect(result.error).toMatch(/Kestrel/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("the clash can be overridden deliberately", async () => {
    world({
      assignments: {
        j2: { t9: { id: "t9", teamName: "Kestrel", room: "Rice 011", time: "5:00 PM", batch: 1 } },
      },
    });
    const result = await assignJudgeToTeam({ judgeUid: "j2", teamId: "t1", allowConflict: true });
    expect(result.ok).toBe(true);
  });

  test("a judge in a different batch is not a clash", async () => {
    world({
      assignments: {
        j2: { t9: { id: "t9", teamName: "Kestrel", room: "Rice 011", time: "5:15 PM", batch: 2 } },
      },
    });
    expect((await assignJudgeToTeam({ judgeUid: "j2", teamId: "t1" })).ok).toBe(true);
  });

  test("an unregistered judge is refused rather than written", async () => {
    world();
    await expect(assignJudgeToTeam({ judgeUid: "nobody", teamId: "t1" }))
      .rejects.toThrow(/not registered/);
  });
});

describe("removing a judge", () => {
  const pair = [
    { judgeId: "j1", judgeName: "Ada J" },
    { judgeId: "j2", judgeName: "Alan J" },
  ];

  test("the removed judge loses their copy, and the rest are rewritten", async () => {
    world({ roster: pair });
    await unassignJudgeFromTeam({ judgeUid: "j2", teamId: "t1" });

    const p = payload();
    expect(p["judges/j2/teamAssignments/t1"]).toBeNull();
    expect(p["judges/j1/teamAssignments/t1"].judges.map((j) => j.judgeId)).toEqual(["j1"]);
    expect(p["teams/t1/schedule/judges"].map((j) => j.judgeId)).toEqual(["j1"]);
  });

  test("the last judge cannot be removed, or the team presents to an empty room", async () => {
    world({ roster: [{ judgeId: "j1", judgeName: "Ada J" }] });
    const result = await unassignJudgeFromTeam({ judgeUid: "j1", teamId: "t1" });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/only judge/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("removing somebody who was never on it changes nothing", async () => {
    world({ roster: pair });
    const result = await unassignJudgeFromTeam({ judgeUid: "j3", teamId: "t1" });

    expect(result.unchanged).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("swapping one judge for another", () => {
  const pair = [
    { judgeId: "j1", judgeName: "Ada J" },
    { judgeId: "j2", judgeName: "Alan J" },
  ];

  test("out and in happen in a single update", async () => {
    world({ roster: pair });
    await swapJudges({ teamId: "t1", fromJudgeUid: "j2", toJudgeUid: "j3" });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const p = payload();
    expect(p["judges/j2/teamAssignments/t1"]).toBeNull();
    expect(p["judges/j3/teamAssignments/t1"].judges.map((j) => j.judgeId)).toEqual(["j1", "j3"]);
    expect(p["judges/j1/teamAssignments/t1"].judges.map((j) => j.judgeId)).toEqual(["j1", "j3"]);
  });

  test("swapping out somebody not on the team is refused", async () => {
    world({ roster: pair });
    const result = await swapJudges({ teamId: "t1", fromJudgeUid: "j3", toJudgeUid: "j1" });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("swapping in somebody already on the team is refused", async () => {
    world({ roster: pair });
    const result = await swapJudges({ teamId: "t1", fromJudgeUid: "j1", toJudgeUid: "j2" });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("a legacy roster stored as an object", () => {
  test("is read, and written back as an array", async () => {
    // early schedules stored judges keyed rather than as a list
    world({ roster: { 0: { judgeId: "j1", judgeName: "Ada J" } } });
    await assignJudgeToTeam({ judgeUid: "j2", teamId: "t1" });

    expect(Array.isArray(payload()["teams/t1/schedule/judges"])).toBe(true);
    expect(payload()["teams/t1/schedule/judges"].map((j) => j.judgeId)).toEqual(["j1", "j2"]);
  });
});

describe("finding a clash", () => {
  test("only the same batch counts, and never the team being edited", async () => {
    world({
      assignments: {
        j1: {
          t1: { id: "t1", batch: 1, room: "Rice 110", time: "5:00 PM", teamName: "Lumen" },
          t9: { id: "t9", batch: 2, room: "Rice 011", time: "5:15 PM", teamName: "Kestrel" },
        },
      },
    });

    expect(await findConflict("j1", "t1", 1)).toBeNull();
    expect((await findConflict("j1", "t1", 2)).teamName).toBe("Kestrel");
  });

  test("a judge with nothing booked never clashes", async () => {
    world();
    expect(await findConflict("j3", "t1", 1)).toBeNull();
  });
});
