// checkDrift itself is pure and needs no mocking -- the fixtures below are
// plain objects. readLiveBasis is not: it reads the database, so the suite
// at the bottom of this file mocks firebase the same way
// generateSchedule.test.js and planSchedule.test.js do, and additionally
// requires planSchedule to pin the one invariant that matters most: that
// readLiveBasis and planSchedule never disagree about who is in scope.
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));

const mockGet = jest.fn();

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path: path ?? "" }),
  get: (...args) => mockGet(...args),
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const { checkDrift, readLiveBasis } = require("./checkDrift");
const { planSchedule } = require("./planSchedule");
const { requireAdmin } = require("../../roles.js");

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

// ---- room-removed repair: a targeted move first, rebuild only as fallback ----
// The brief's own "a room the plan uses was removed" test above only pins the
// message. These two pin the repair itself: a free room in the same batch when
// one exists, and a rebuild only when the batch genuinely has nowhere to put
// the team -- so a removed room never costs an organizer their other hand edits.

test("a room removed offers a free room in the same batch, keeping time and panel", () => {
  const { blocking } = checkDrift(basis, live({ rooms: ["R2"] }), plan);

  const forT1 = blocking.find((b) => b.repair.teamId === "t1");
  expect(forT1.repair).toEqual({ type: "moveTeam", teamId: "t1", batch: 1, room: "R2" });

  const forT2 = blocking.find((b) => b.repair.teamId === "t2");
  expect(forT2.repair).toEqual({ type: "moveTeam", teamId: "t2", batch: 2, room: "R2" });
});

test("a room removed falls back to rebuild when its batch has no free room", () => {
  const twoRoomBasis = {
    teamIds: ["t1", "t2"], judgeIds: ["j0", "j1"],
    rooms: ["R1", "R2"], batchCount: 1, batchTimes: { 1: "5:00 PM" }, target: 1,
  };
  const bothInBatchOne = {
    assignments: {
      t1: { id: "t1", teamName: "A", batch: 1, room: "R1", time: "5:00 PM",
            judges: [{ judgeId: "j0", judgeName: "Ada" }] },
      t2: { id: "t2", teamName: "B", batch: 1, room: "R2", time: "5:00 PM",
            judges: [{ judgeId: "j1", judgeName: "Bo" }] },
    },
    basis: twoRoomBasis, judgeNames: { j0: "Ada", j1: "Bo" }, teamNames: { t1: "A", t2: "B" },
  };
  const liveOneRoom = {
    ...twoRoomBasis, rooms: ["R2"],
    teamNames: { t1: "A", t2: "B" }, judgeNames: { j0: "Ada", j1: "Bo" },
  };

  const { blocking } = checkDrift(twoRoomBasis, liveOneRoom, bothInBatchOne);
  expect(blocking).toHaveLength(1);
  expect(blocking[0].message).toMatch(/R1 is no longer a configured room/);
  expect(blocking[0].repair).toEqual({ type: "rebuild" });
});

// ---- readLiveBasis: the database-reading half ----
//
// checkDrift above never touches the database. readLiveBasis is the one
// function in this file that does, and it has to shape teams and judges
// exactly as planSchedule does -- same `submitted` filter, same
// `isRound1Judge`/`checkedIn` filters, same displayName fallback -- or
// checkDrift would fire on a difference between the two readers that was
// never a real change in the world.

/** An event with `teams` submitted teams and `judges` round-one judges. */
function world({ teams = 4, judges = 4, rooms = 4, batchCount = 2, checkedIn = true } = {}) {
  const teamsData = {};
  for (let i = 0; i < teams; i++) {
    teamsData[`t${i}`] = { name: `Team ${i}`, submitted: true, members: { [`c${i}`]: true } };
  }
  const judgesData = {};
  for (let i = 0; i < judges; i++) {
    judgesData[`j${i}`] = {
      firstName: "Judge", lastName: String(i), isRound1Judge: true, checkedIn,
    };
  }

  return async (r) => {
    const table = {
      teams: teamsData,
      judges: judgesData,
      "config/judgingRooms": Array.from({ length: rooms }, (_, i) => `Room ${i}`),
      "config/batchCount": batchCount,
      "config/batchTimes": { 1: "5:00 PM", 2: "5:15 PM" },
    };
    const value = table[r.path];
    return { exists: () => value !== undefined, val: () => value ?? null };
  };
}

describe("readLiveBasis", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation(world());
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({ uid: "admin-1" });
  });

  test("only teams with submitted truthy appear in teamIds", async () => {
    mockGet.mockImplementation(async (r) => {
      const base = await world({ teams: 3 })(r);
      if (r.path !== "teams") return base;
      const teams = { ...base.val(), ghost: { name: "Ghost", submitted: false } };
      return { exists: () => true, val: () => teams };
    });

    const liveBasis = await readLiveBasis(false);
    expect(liveBasis.teamIds).toEqual(["t0", "t1", "t2"]);
    expect(liveBasis.teamIds).not.toContain("ghost");
  });

  test("only judges with isRound1Judge === true appear in judgeIds", async () => {
    mockGet.mockImplementation(async (r) => {
      const base = await world({ judges: 3 })(r);
      if (r.path !== "judges") return base;
      const judges = {
        ...base.val(),
        notRoundOne: { firstName: "Not", lastName: "RoundOne", isRound1Judge: false },
      };
      return { exists: () => true, val: () => judges };
    });

    const liveBasis = await readLiveBasis(false);
    expect(liveBasis.judgeIds).toEqual(["j0", "j1", "j2"]);
    expect(liveBasis.judgeIds).not.toContain("notRoundOne");
  });

  test("onlyCheckedIn excludes a round-one judge who has not checked in", async () => {
    mockGet.mockImplementation(async (r) => {
      const base = await world({ judges: 3 })(r);
      if (r.path !== "judges") return base;
      const judges = { ...base.val() };
      judges.j2 = { ...judges.j2, checkedIn: false };
      return { exists: () => true, val: () => judges };
    });

    const excluded = await readLiveBasis(true);
    expect(excluded.judgeIds).toEqual(["j0", "j1"]);

    const included = await readLiveBasis(false);
    expect(included.judgeIds).toEqual(["j0", "j1", "j2"]);
  });

  test("teamIds and judgeIds come back sorted", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "teams") {
        return {
          exists: () => true,
          val: () => ({
            tC: { name: "C", submitted: true },
            tA: { name: "A", submitted: true },
            tB: { name: "B", submitted: true },
          }),
        };
      }
      if (r.path === "judges") {
        return {
          exists: () => true,
          val: () => ({
            jC: { isRound1Judge: true },
            jA: { isRound1Judge: true },
            jB: { isRound1Judge: true },
          }),
        };
      }
      return world({ teams: 0, judges: 0 })(r);
    });

    const liveBasis = await readLiveBasis(false);
    expect(liveBasis.teamIds).toEqual(["tA", "tB", "tC"]);
    expect(liveBasis.judgeIds).toEqual(["jA", "jB", "jC"]);
  });

  test("judgeNames falls back rather than yielding an empty string for a nameless judge", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "judges") {
        return { exists: () => true, val: () => ({ j0: { isRound1Judge: true } }) };
      }
      return world({ judges: 0 })(r);
    });

    const liveBasis = await readLiveBasis(false);
    expect(liveBasis.judgeNames.j0).toBe("Unnamed Judge");
  });

  test("an absent teams node yields empty ids rather than throwing", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "teams") return { exists: () => false, val: () => null };
      return world()(r);
    });

    await expect(readLiveBasis(false)).resolves.toMatchObject({ teamIds: [] });
  });
});

describe("readLiveBasis never disagrees with planSchedule", () => {
  // This is the invariant that actually matters: if these two readers ever
  // shaped teams or judges differently, checkDrift would fire spurious drift
  // on every publish and block a schedule that was actually fine. Building
  // one world and reading it through both functions pins them together, so a
  // future edit to either one that breaks the agreement fails a test here
  // instead of failing silently on a real event.
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({ uid: "admin-1" });
  });

  test("teamIds and judgeIds agree with planSchedule when onlyCheckedIn is false", async () => {
    mockGet.mockReset();
    mockGet.mockImplementation(world({ teams: 6, judges: 6, rooms: 6, batchCount: 2 }));

    const { plan } = await planSchedule({});
    const liveBasis = await readLiveBasis(false);

    expect(liveBasis.teamIds).toEqual(plan.basis.teamIds);
    expect(liveBasis.judgeIds).toEqual(plan.basis.judgeIds);
  });

  test("teamIds and judgeIds agree with planSchedule when onlyCheckedIn is true", async () => {
    mockGet.mockReset();
    mockGet.mockImplementation(async (r) => {
      const base = await world({ teams: 6, judges: 6, rooms: 6, batchCount: 2 })(r);
      if (r.path !== "judges") return base;
      const judges = { ...base.val() };
      // two of the six round-one judges never checked in
      judges.j0 = { ...judges.j0, checkedIn: false };
      judges.j3 = { ...judges.j3, checkedIn: false };
      return { exists: () => true, val: () => judges };
    });

    const { plan } = await planSchedule({ onlyCheckedIn: true });
    const liveBasis = await readLiveBasis(true);

    expect(liveBasis.teamIds).toEqual(plan.basis.teamIds);
    expect(liveBasis.judgeIds).toEqual(plan.basis.judgeIds);
  });
});
