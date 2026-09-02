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
