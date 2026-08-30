/**
 * getJudgeSchedule end to end, with the database mocked.
 *
 * The arithmetic is covered in schedulePlan.test.js. What was never covered is
 * the part that writes: that a restore point is taken BEFORE the replacement,
 * that a failure to take one abandons the whole thing, and that the payload
 * actually written matches what the planner decided. Generation replaces every
 * assignment in the event, so those are the properties worth pinning.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));

const mockUpdate = jest.fn();
const mockGet = jest.fn();

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path: path ?? "" }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "generated-id" }),
  serverTimestamp: () => 1700000000000,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const { getJudgeSchedule } = require("./getJudgeSchedule");
const { requireAdmin } = require("../../roles.js");

/** An event with `teams` submitted teams and `judges` round-one judges. */
function world({ teams = 12, judges = 12, rooms = 10, batchCount = 3, checkedIn = true } = {}) {
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
      "config/batchTimes": { 1: "5:00 PM", 2: "5:15 PM", 3: "5:30 PM" },
    };
    const value = table[r.path];
    return { exists: () => value !== undefined, val: () => value ?? null };
  };
}

/** The update that wrote the schedule, i.e. the one carrying scheduleMeta. */
const schedulePayload = () =>
  mockUpdate.mock.calls.map((call) => call[1]).find((p) => "config/scheduleMeta" in p);

const snapshotPayload = () =>
  mockUpdate.mock.calls.map((call) => call[1]).find((p) => p["snapshots/generated-id"]);

beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockImplementation(world());
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

describe("a restore point comes first", () => {
  test("the schedule is written only after a restore point exists", async () => {
    const result = await getJudgeSchedule();
    expect(result.ok).toBe(true);

    const order = mockUpdate.mock.calls.map(([, payload]) =>
      payload["snapshots/generated-id"] ? "snapshot" : "schedule"
    );
    expect(order.indexOf("snapshot")).toBeLessThan(order.indexOf("schedule"));
  });

  test("the restore point carries the state it is about to replace", async () => {
    await getJudgeSchedule();
    const stored = snapshotPayload()["snapshots/generated-id"];
    expect(stored.entries.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(["teams", "judges", "config/scheduleMeta"])
    );
  });

  test("nothing is replaced when the restore point cannot be written", async () => {
    // the restore point is the first write; fail it and generation must abort
    mockUpdate.mockRejectedValueOnce(new Error("network down"));

    const result = await getJudgeSchedule();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/restore point/i);
    expect(schedulePayload()).toBeUndefined();
  });

  test("the generation is recorded in the audit log", async () => {
    await getJudgeSchedule();
    const entry = schedulePayload()["adminLog/generated-id"];
    expect(entry.action).toBe("schedule.generate");
    expect(entry.by).toBe("admin-1");
    expect(entry.summary).toMatch(/Restore point taken first/);
  });
});

describe("what gets written", () => {
  test("every submitted team gets a slot, and every judge a list", async () => {
    await getJudgeSchedule();
    const payload = schedulePayload();

    for (let i = 0; i < 12; i++) {
      expect(payload[`teams/t${i}/schedule`]).toMatchObject({
        id: `t${i}`,
        batch: expect.any(Number),
        room: expect.any(String),
      });
    }
    expect(payload["judges/j0/teamAssignments"]).toBeTruthy();
  });

  test("no judge is booked into two rooms in the same batch", async () => {
    await getJudgeSchedule();
    const payload = schedulePayload();

    for (let i = 0; i < 12; i++) {
      const assignments = Object.values(payload[`judges/j${i}/teamAssignments`] ?? {});
      const batches = assignments.map((a) => a.batch);
      expect(new Set(batches).size).toBe(batches.length);
    }
  });

  test("a judge who is no longer eligible has their list cleared", async () => {
    mockGet.mockImplementation(async (r) => {
      const base = await world({ teams: 12, judges: 12 })(r);
      if (r.path !== "judges") return base;
      const judges = { ...base.val() };
      // registered, but never marked for round one
      judges.stale = { firstName: "Stale", isRound1Judge: false, teamAssignments: { t0: {} } };
      return { exists: () => true, val: () => judges };
    });

    await getJudgeSchedule();
    expect(schedulePayload()["judges/stale/teamAssignments"]).toBeNull();
  });
});

describe("supply problems refuse with advice rather than a bare error", () => {
  test("too few rooms says how many more are needed", async () => {
    mockGet.mockImplementation(world({ teams: 30, judges: 12, rooms: 4 }));
    const result = await getJudgeSchedule();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/more room|batch count/i);
    expect(schedulePayload()).toBeUndefined();
  });

  test("too few judges refuses before writing anything", async () => {
    mockGet.mockImplementation(world({ teams: 30, judges: 2, rooms: 20 }));
    const result = await getJudgeSchedule();

    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("no rooms configured is its own message", async () => {
    mockGet.mockImplementation(world({ rooms: 0 }));
    const result = await getJudgeSchedule();

    expect(result.error).toMatch(/No judging rooms are configured/);
  });

  test("thin teams are named, not summarised", async () => {
    mockGet.mockImplementation(world({ teams: 20, judges: 8, rooms: 20 }));
    const result = await getJudgeSchedule();

    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/Seen by one judge only: Team/);
  });
});

describe("a surplus of judges", () => {
  test("panels are capped and the rest are reported as spares", async () => {
    mockGet.mockImplementation(world({ teams: 6, judges: 30, rooms: 10 }));
    const result = await getJudgeSchedule();

    expect(result.ok).toBe(true);
    // the old allocator sent all 30 judges into every room
    expect(result.stats.maxJudgesPerTeam).toBeLessThanOrEqual(3);
    expect(result.stats.spareJudges).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toMatch(/spares/i);
  });

  test("a spare judge is written as null rather than an empty object", async () => {
    mockGet.mockImplementation(world({ teams: 6, judges: 30, rooms: 10 }));
    await getJudgeSchedule();

    const payload = schedulePayload();
    const cleared = Object.keys(payload)
      .filter((path) => path.endsWith("/teamAssignments"))
      .filter((path) => payload[path] === null);
    expect(cleared.length).toBeGreaterThan(0);
  });
});
