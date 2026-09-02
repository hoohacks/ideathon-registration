/**
 * planFinalRound and publishFinalRound, with the database mocked.
 *
 * planFinalRound is the read-only half of the final-round plan/publish split:
 * it ranks every scored team, cuts the top `limit`, and reports what an
 * organizer needs to see about that cut -- without writing anything.
 * publishFinalRound is the writer: it takes a finalist set (as given, so an
 * organizer's override of the cut is honoured) and the `basis` the plan was
 * built from, and refuses to write if a card has arrived since.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));

const mockUpdate = jest.fn();
const mockGet = jest.fn();

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path: path ?? "" }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "generated-id" }),
  onValue: () => () => {},
  serverTimestamp: () => 1700000000000,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const { planFinalRound, publishFinalRound } = require("./finalRoundService");
const { requireAdmin } = require("../../roles.js");

/**
 * Five submitted teams with first-round cards:
 *   t0  38 avg, 2 judges  -- clear first
 *   t1  36 avg, 1 judge   -- in the cut, but on a single card
 *   t2  34 avg, 2 judges
 *   t3  30 avg, 2 judges  -- last team in (tiebreak: more judges than t4)
 *   t4  30 avg, 1 judge   -- first team out, tied with t3 on average
 *
 * Each card carries only the `problem` field (max 10), scaled so a single
 * criterion decides the whole 40-point average -- simpler than filling every
 * field to hit a target number.
 */
function world() {
  const teamsData = {};
  for (let i = 0; i < 5; i++) {
    teamsData[`t${i}`] = { name: `Team ${i}`, submitted: true };
  }

  const judgesData = {};
  for (let i = 0; i < 5; i++) {
    judgesData[`j${i}`] = {
      firstName: "Judge", lastName: String(i), isRound1Judge: true, checkedIn: true,
    };
  }

  const scoresData = {
    t0: { j0: { problem: 9.5 }, j1: { problem: 9.5 } },
    t1: { j0: { problem: 9 } },
    t2: { j0: { problem: 8.5 }, j1: { problem: 8.5 } },
    t3: { j0: { problem: 7.5 }, j1: { problem: 7.5 } },
    t4: { j0: { problem: 7.5 } },
  };

  return async (r) => {
    const table = {
      teams: teamsData,
      judges: judgesData,
      "scores/first": scoresData,
    };
    const value = table[r.path];
    return { exists: () => value !== undefined, val: () => value ?? null };
  };
}

beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockImplementation(world());
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

test("planning writes nothing", async () => {
  const result = await planFinalRound({});
  expect(result.ok).toBe(true);
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("it names a finalist that reached the cut on too few judges", async () => {
  const { warnings } = await planFinalRound({});
  expect(warnings.join(" ")).toMatch(/fewer than 2 judges/i);
});

test("it names a tie straddling the cut line", async () => {
  const { warnings } = await planFinalRound({});
  expect(warnings.join(" ")).toMatch(/tied on average/);
});

test("it records how many cards each team was ranked on", async () => {
  const { basis } = await planFinalRound({});
  expect(Object.keys(basis.cardCounts).length).toBeGreaterThan(0);
});

test("the top four teams by average make the cut, in order", async () => {
  const { finalists } = await planFinalRound({});
  expect(finalists.map((t) => t.teamId)).toEqual(["t0", "t1", "t2", "t3"]);
});

describe("publishing", () => {
  test("refuses when a card arrived since the ranking", async () => {
    const plan = await planFinalRound({});
    plan.basis.cardCounts[plan.finalists[0].teamId] -= 1;
    const result = await publishFinalRound(plan);
    expect(result.ok).toBe(false);
    expect(result.staleScores).toMatch(/scored since/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("writes the finalist set as given, honouring an organizer's override", async () => {
    const plan = await planFinalRound({});
    // swap the last team in for the one that was cut
    const overridden = [...plan.finalists.slice(0, 3), plan.ranked[4]];
    const result = await publishFinalRound({ finalists: overridden, basis: plan.basis });
    expect(result.ok).toBe(true);
    const payload = mockUpdate.mock.calls
      .map((call) => call[1])
      .find((p) => p["finalRound/teams"]);
    expect(Object.keys(payload["finalRound/teams"])).toEqual(
      expect.arrayContaining(["t0", "t1", "t2", "t4"])
    );
    expect(payload["finalRound/teams"]).not.toHaveProperty("t3");
  });

  test("a restore point is taken before anything is written", async () => {
    const plan = await planFinalRound({});
    const result = await publishFinalRound(plan);
    expect(result.ok).toBe(true);
    expect(result.snapshotId).toBe("generated-id");
    const order = mockUpdate.mock.calls.map(([, p]) =>
      p["snapshots/generated-id"] ? "snapshot" : "finalRound"
    );
    expect(order.indexOf("snapshot")).toBeLessThan(order.indexOf("finalRound"));
  });
});
