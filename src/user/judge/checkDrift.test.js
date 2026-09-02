const { checkDrift } = require("./checkDrift");

const basis = {
  teamIds: ["t1", "t2"], judgeIds: ["j0", "j1"],
  rooms: ["R1", "R2"], batchCount: 2, batchTimes: { 1: "5:00 PM", 2: "5:15 PM" }, target: 2,
};
const plan = {
  assignments: {
    t1: { id: "t1", teamName: "A", batch: 1, room: "R1", time: "5:00 PM",
          judges: [{ judgeId: "j0", judgeName: "Ada" }] },
    t2: { id: "t2", teamName: "B", batch: 2, room: "R1", time: "5:15 PM",
          judges: [{ judgeId: "j1", judgeName: "Bo" }] },
  },
  basis, judgeNames: { j0: "Ada", j1: "Bo" }, teamNames: { t1: "A", t2: "B" },
};
const live = (over = {}) => ({ ...basis, teamNames: { t1: "A", t2: "B" }, judgeNames: { j0: "Ada", j1: "Bo" }, ...over });

test("nothing moved", () => {
  const { blocking, advisory } = checkDrift(basis, live(), plan);
  expect(blocking).toEqual([]);
  expect(advisory).toEqual([]);
});

test("a team submitted since, and can be placed", () => {
  const { blocking } = checkDrift(basis, live({
    teamIds: ["t1", "t2", "t3"], teamNames: { t1: "A", t2: "B", t3: "Vireo" },
  }), plan);
  expect(blocking).toHaveLength(1);
  expect(blocking[0].message).toMatch(/Vireo submitted after this plan was built/);
  expect(blocking[0].repair).toMatchObject({ type: "moveTeam", teamId: "t3" });
});

test("a team withdrew, and is dropped", () => {
  const { blocking } = checkDrift(basis, live({ teamIds: ["t1"] }), plan);
  expect(blocking[0].message).toMatch(/B withdrew/);
  expect(blocking[0].repair).toMatchObject({ type: "dropTeam", teamId: "t2" });
});

test("a judge on a panel lost their round one mark", () => {
  const { blocking } = checkDrift(basis, live({ judgeIds: ["j0"] }), plan);
  expect(blocking[0].message).toMatch(/Bo is no longer a first round judge/);
  expect(blocking[0].repair).toMatchObject({ type: "removeJudge", teamId: "t2", judgeUid: "j1" });
});

test("a judge who left but was only a spare is advisory", () => {
  const spare = { ...basis, judgeIds: ["j0", "j1", "j2"] };
  const { blocking, advisory } = checkDrift(spare, live({ judgeIds: ["j0", "j1"] }), plan);
  expect(blocking).toEqual([]);
  expect(advisory[0].message).toMatch(/no longer available/);
});

test("a room the plan uses was removed", () => {
  const { blocking } = checkDrift(basis, live({ rooms: ["R2"] }), plan);
  expect(blocking[0].message).toMatch(/R1 is no longer a configured room/);
});

test("batch count changed, so the shape of the day changed", () => {
  const { blocking } = checkDrift(basis, live({ batchCount: 4 }), plan);
  expect(blocking[0].repair).toEqual({ type: "rebuild" });
});

test("target changed, so the shape of the day changed", () => {
  // the basis was built when target was 3; config now says 2
  const { blocking } = checkDrift({ ...basis, target: 3 }, live({ target: 2 }), plan);
  expect(blocking.some((b) => b.repair.type === "rebuild")).toBe(true);
});

test("batch times changed, which is only a label", () => {
  const { blocking, advisory } = checkDrift(
    basis, live({ batchTimes: { 1: "6:00 PM", 2: "6:15 PM" } }), plan
  );
  expect(blocking).toEqual([]);
  expect(advisory[0].message).toMatch(/batch times changed/i);
});

test("a name changed", () => {
  const { blocking, advisory } = checkDrift(
    basis, live({ judgeNames: { j0: "Ada Lovelace", j1: "Bo" } }), plan
  );
  expect(blocking).toEqual([]);
  expect(advisory[0].message).toMatch(/Ada is now Ada Lovelace/);
});
