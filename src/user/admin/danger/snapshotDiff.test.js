const { diffSnapshot } = require("./snapshotDiff");

const entries = (obj) =>
  Object.entries(obj).map(([path, value]) => ({ path, value: JSON.stringify(value) }));

test("counts what changes per path", () => {
  const result = diffSnapshot(
    entries({ teams: { t1: { name: "A" }, t2: { name: "B" } } }),
    { teams: { t1: { name: "A" }, t3: { name: "C" } } }
  );
  expect(result.byPath).toEqual([{ path: "teams", added: 1, changed: 0, removed: 1 }]);
});

test("a score present now and absent in the snapshot is named as a loss", () => {
  const result = diffSnapshot(
    entries({ "scores/round1": { t1: { j0: { total: 30 } } } }),
    { "scores/round1": { t1: { j0: { total: 30 }, j1: { total: 28 } } } }
  );
  expect(result.lostScores).toEqual([{ teamId: "t1", judgeUid: "j1" }]);
});

test("a score in the snapshot but not live is not a loss", () => {
  const result = diffSnapshot(
    entries({ "scores/round1": { t1: { j0: {}, j1: {} } } }),
    { "scores/round1": { t1: { j0: {} } } }
  );
  expect(result.lostScores).toEqual([]);
});

test("a null in the snapshot means the path did not exist", () => {
  const result = diffSnapshot(entries({ teams: null }), { teams: { t1: { name: "A" } } });
  expect(result.byPath[0].removed).toBe(1);
});

/**
 * The bare "scores" path -- what `JUDGING_PATHS` (src/user/admin/snapshots.js)
 * actually snapshots -- is `scores/{round}/{teamId}/{judgeUid}`, one level
 * deeper than the tests above, which all use an already round-scoped path
 * ("scores/round1"). This is exactly the path a "clear the schedule and
 * every score" restore point carries, so it is the highest-stakes shape for
 * `lostScores` to get right.
 */
describe("the bare \"scores\" path (round -> team -> judge, not team -> judge)", () => {
  test("names the real team and judge, not the round, as the loss", () => {
    const result = diffSnapshot(
      entries({
        scores: {
          round1: { t1: { j0: { total: 30 } } },
          final: { t2: { j1: { total: 40 } } },
        },
      }),
      {
        scores: {
          round1: { t1: { j0: { total: 30 }, j2: { total: 25 } } },
          final: { t2: { j1: { total: 40 } } },
        },
      }
    );
    // t1/j2 is the loss. If the round level were mistaken for the team
    // level, this would come back as { teamId: "round1", judgeUid: "t1" }
    // or similar instead.
    expect(result.lostScores).toEqual([{ teamId: "t1", judgeUid: "j2" }]);
  });

  test("a loss in a later round (not round1) is still found", () => {
    const result = diffSnapshot(
      entries({ scores: { final: { t3: { j0: { total: 10 } } } } }),
      { scores: { final: { t3: { j0: { total: 10 }, j5: { total: 5 } } } } }
    );
    expect(result.lostScores).toEqual([{ teamId: "t3", judgeUid: "j5" }]);
  });

  test("the bare path and a round-scoped path in the same restore point are each walked correctly", () => {
    const result = diffSnapshot(
      entries({
        scores: { round1: { t1: { j0: { total: 1 } } } },
        "scores/round1": { t5: { j0: { total: 2 } } },
      }),
      {
        scores: { round1: { t1: { j0: { total: 1 }, j9: { total: 9 } } } },
        "scores/round1": { t5: { j0: { total: 2 }, j1: { total: 3 } } },
      }
    );
    expect(result.lostScores).toEqual([
      { teamId: "t1", judgeUid: "j9" },
      { teamId: "t5", judgeUid: "j1" },
    ]);
  });

  test("byPath counts the bare \"scores\" path at card level, not round level", () => {
    const result = diffSnapshot(
      entries({
        scores: {
          round1: {
            t1: { j0: { total: 30 } }, // present in both, value differs -> changed
            t2: { j0: { total: 10 } }, // snapshot only -> added back by a restore
          },
        },
      }),
      {
        scores: {
          round1: {
            t1: { j0: { total: 99 } },
            t3: { j0: { total: 5 } }, // live only -> destroyed by a restore
          },
        },
      }
    );
    // Round-level counting would report one round ("round1") that merely
    // "changed", which is true on almost any score update and says nothing
    // about how much is at stake. Card-level counting says what a restore
    // actually does: one card comes back, one changes, one is destroyed.
    expect(result.byPath).toEqual([{ path: "scores", added: 1, changed: 1, removed: 1 }]);
    expect(result.lostScores).toEqual([{ teamId: "t3", judgeUid: "j0" }]);
    // The number this path reports as "removed" is not just some count --
    // it is exactly the number of cards lostScores goes on to name.
    expect(result.byPath[0].removed).toBe(result.lostScores.length);
  });
});
