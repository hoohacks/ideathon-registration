/**
 * Break-glass tooling.
 *
 * The one that needs explaining is deleteScore. A score card cannot be put
 * back: enteredBy is pinned to auth.uid by the rules, which is where "a judge
 * cannot file under another judge" lives, so a restore by anyone other than the
 * original author fails validation. Rather than weaken that rule, the delete is
 * marked not-undoable and the card is returned so the caller can re-enter it
 * through the existing paper-score dialog.
 */
jest.mock("../../../firebase", () => ({ database: {}, auth: {} }));

const mockUpdate = jest.fn(async () => {});
const mockGet = jest.fn(async () => ({ exists: () => false, val: () => null }));

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "entry-1" }),
  serverTimestamp: () => 0,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const {
  overrideSlotChanges,
  deleteScore,
  setTeamSubmitted,
  clearSchedule,
} = require("./dangerZone");
const { requireAdmin } = require("../../../roles.js");

/**
 * create-react-app sets `resetMocks: true`, which strips the implementation off
 * every jest.fn before each test -- so an implementation passed to jest.fn() at
 * declaration is gone by the time the first test runs and the mock silently
 * returns undefined. Every implementation has to be re-established here.
 */
beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

describe("overriding one team's slot", () => {
  const teamData = {
    schedule: { id: "t1", teamName: "Lumen", room: "Rice 110", time: "5:00 PM", batch: 1 },
  };
  const judgesData = {
    j1: { teamAssignments: { t1: { room: "Rice 110", time: "5:00 PM" } } },
    j2: { teamAssignments: { t1: { room: "Rice 110", time: "5:00 PM" } } },
    j3: { teamAssignments: { t2: { room: "Rice 204", time: "5:00 PM" } } },
  };

  test("moves the team copy and every assigned judge's copy", () => {
    const changes = overrideSlotChanges({
      teamId: "t1", room: "Rice 204", time: "5:45 PM", teamData, judgesData,
    });
    const paths = changes.map((c) => c.path);

    expect(paths).toContain("teams/t1/schedule/room");
    expect(paths).toContain("teams/t1/schedule/time");
    expect(paths).toContain("judges/j1/teamAssignments/t1/room");
    expect(paths).toContain("judges/j2/teamAssignments/t1/time");
    expect(paths).not.toContain("judges/j3/teamAssignments/t2/room");
  });

  test("only writes the field that actually changed", () => {
    const changes = overrideSlotChanges({
      teamId: "t1", room: "Rice 110", time: "5:45 PM", teamData, judgesData,
    });
    expect(changes.map((c) => c.path)).not.toContain("teams/t1/schedule/room");
    expect(changes.map((c) => c.path)).toContain("teams/t1/schedule/time");
  });

  test("a team with no schedule yields nothing to change", () => {
    expect(overrideSlotChanges({
      teamId: "t1", room: "A", time: "B", teamData: {}, judgesData,
    })).toEqual([]);
  });
});

describe("deleting a score", () => {
  const card = {
    problem: 8, innovation: 7, impact: 9, viability: 4, pitch_quality: 4,
    fundable: true, judgeUid: "j1", teamId: "t1", enteredBy: "j1", submittedAt: 1,
  };

  test("removes the card and returns it for re-entry", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => card });

    const result = await deleteScore({
      round: "first", teamId: "t1", judgeUid: "j1", teamName: "Lumen", judgeName: "Ada",
    });

    expect(result.ok).toBe(true);
    expect(result.card).toEqual(card);
    expect(mockUpdate.mock.calls[0][1]["scores/first/t1/j1"]).toBeNull();
  });

  test("is marked not undoable, because enteredBy is pinned to auth.uid", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => card });
    await deleteScore({ round: "first", teamId: "t1", judgeUid: "j1" });
    expect(mockUpdate.mock.calls[0][1]["adminLog/entry-1"].undoable).toBe(false);
  });

  test("the whole card is kept in the entry so it can be re-typed", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => card });
    await deleteScore({ round: "first", teamId: "t1", judgeUid: "j1" });

    const logged = mockUpdate.mock.calls[0][1]["adminLog/entry-1"];
    expect(JSON.parse(logged.changes[0].before)).toEqual(card);
  });

  test("a card that is not there is refused", async () => {
    const result = await deleteScore({ round: "first", teamId: "t1", judgeUid: "j1" });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("an unknown round is refused", async () => {
    expect((await deleteScore({ round: "middle", teamId: "t1", judgeUid: "j1" })).ok).toBe(false);
  });
});

describe("un-submitting a team", () => {
  test("flips the flag and logs it", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => true });
    const result = await setTeamSubmitted({ teamId: "t1", teamName: "Lumen", submitted: false });

    expect(result.ok).toBe(true);
    expect(mockUpdate.mock.calls[0][1]["teams/t1/submitted"]).toBe(false);
  });
});

describe("clearing the schedule", () => {
  test("nulls every team schedule and every judge assignment", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "teams") {
        return { exists: () => true, val: () => ({ t1: { schedule: { room: "A" } }, t2: {} }) };
      }
      if (r.path === "judges") {
        return { exists: () => true, val: () => ({ j1: { teamAssignments: { t1: {} } }, j2: {} }) };
      }
      return { exists: () => false, val: () => null };
    });

    const result = await clearSchedule();
    expect(result.ok).toBe(true);

    const payload = mockUpdate.mock.calls[0][1];
    expect(payload["teams/t1/schedule"]).toBeNull();
    expect(payload["judges/j1/teamAssignments"]).toBeNull();
    expect(payload["config/scheduleMeta"]).toBeNull();
  });

  test("refuses when there is no schedule to clear", async () => {
    const result = await clearSchedule();
    expect(result.ok).toBe(false);
  });
});

describe("clearing scores as well, to start from scratch", () => {
  /**
   * Clearing the schedule leaves scores alone by default -- they are keyed by
   * team and judge, so they survive a regeneration and re-attach. Starting over
   * for real is a separate, louder choice.
   *
   * The part that is easy to miss: READ_LEGACY_SCORE_PATH is still true, so
   * pre-migration cards live at teams/{id}/scores as well as under /scores.
   * A reset that only cleared /scores would leave cards that still show in the
   * dashboard and still count toward the averages the final round is picked
   * from -- which is exactly not starting from scratch.
   */
  const world = (extra = {}) => async (r) => {
    const data = {
      teams: {
        t1: { schedule: { room: "A" }, scores: { j1: { problem: 8 } } },
        t2: { finalScores: { j2: { problem: 7 } } },
      },
      judges: { j1: { teamAssignments: { t1: {} } } },
      scores: { first: { t1: { j1: { problem: 8 } } }, final: {} },
      ...extra,
    }[r.path];
    return { exists: () => data !== undefined, val: () => data };
  };

  test("scores are left alone by default", async () => {
    mockGet.mockImplementation(world());
    await clearSchedule();

    const payload = mockUpdate.mock.calls[0][1];
    expect(payload["scores"]).toBeUndefined();
    expect(payload["teams/t1/scores"]).toBeUndefined();
    expect(payload["teams/t1/schedule"]).toBeNull();
  });

  test("includeScores wipes the whole scores node", async () => {
    mockGet.mockImplementation(world());
    await clearSchedule({ includeScores: true });

    expect(mockUpdate.mock.calls[0][1]["scores"]).toBeNull();
  });

  test("and the pre-migration copies on the team nodes", async () => {
    mockGet.mockImplementation(world());
    await clearSchedule({ includeScores: true });

    const payload = mockUpdate.mock.calls[0][1];
    expect(payload["teams/t1/scores"]).toBeNull();
    expect(payload["teams/t2/finalScores"]).toBeNull();
  });

  test("a team with no legacy copy is not given an empty write", async () => {
    mockGet.mockImplementation(world());
    await clearSchedule({ includeScores: true });

    const payload = mockUpdate.mock.calls[0][1];
    expect("teams/t2/scores" in payload).toBe(false);
    expect("teams/t1/finalScores" in payload).toBe(false);
  });

  test("the schedule and the scores go in one atomic update", async () => {
    mockGet.mockImplementation(world());
    await clearSchedule({ includeScores: true });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  test("scores can be cleared even when there is no schedule left", async () => {
    mockGet.mockImplementation(async (r) => {
      const data = {
        teams: { t1: { scores: { j1: { problem: 8 } } } },
        judges: {},
        scores: { first: { t1: { j1: {} } } },
      }[r.path];
      return { exists: () => data !== undefined, val: () => data };
    });

    const result = await clearSchedule({ includeScores: true });
    expect(result.ok).toBe(true);
    expect(mockUpdate.mock.calls[0][1]["scores"]).toBeNull();
  });

  test("refuses when there is genuinely nothing to clear", async () => {
    mockGet.mockImplementation(async () => ({ exists: () => false, val: () => null }));
    const result = await clearSchedule({ includeScores: true });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("the summary says scores went, so the feed is not misleading", async () => {
    mockGet.mockImplementation(world());
    await clearSchedule({ includeScores: true });
    expect(mockUpdate.mock.calls[0][1]["adminLog/entry-1"].summary).toMatch(/score/i);
  });
});
