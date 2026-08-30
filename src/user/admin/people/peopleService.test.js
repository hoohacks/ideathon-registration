/**
 * Roles, and removing people.
 *
 * The fan-out is the part worth pinning. A judge's name is copied onto every
 * team's schedule card, because a judge cannot read /teams -- so deleting the
 * judge record alone leaves their name on a card nobody can explain, and leaves
 * them in the final round's excludedJudges, where they permanently block a
 * finalist from being judged by anyone.
 */
jest.mock("../../../firebase", () => ({ database: {}, auth: { currentUser: { uid: "admin-1" } }, USING_EMULATOR: false }));

const mockUpdate = jest.fn();
const mockGet = jest.fn();

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path: path ?? "" }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "new-id" }),
  serverTimestamp: () => 1700000000000,
}));
jest.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { uid: "admin-1" } }),
  createUserWithEmailAndPassword: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  signOut: jest.fn(),
  connectAuthEmulator: jest.fn(),
}));
jest.mock("firebase/app", () => ({ initializeApp: jest.fn(), deleteApp: jest.fn() }));
jest.mock("../../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const {
  removalChanges, listPeople, matchesQuery, blankJudge, blankCompetitor,
  setRole, deletePerson, bulkSet, deleteTeam,
} = require("./peopleService");
const { requireAdmin } = require("../../../roles.js");

const WORLD = {
  admins: { "admin-1": true, "admin-2": true },
  judges: {
    j1: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isRound1Judge: true, checkedIn: false },
    j2: { firstName: "Alan", lastName: "Turing", email: "alan@example.com", isRound1Judge: true, checkedIn: false },
  },
  competitors: {
    c1: { firstName: "Grace", lastName: "Hopper", email: "grace@example.com", teamId: "t1" },
  },
  teams: {
    t1: {
      name: "Lumen",
      members: { c1: true },
      schedule: { room: "Rice 110", judges: [{ judgeId: "j1", judgeName: "Ada Lovelace" }, { judgeId: "j2", judgeName: "Alan Turing" }] },
    },
  },
  scores: { first: { t1: { j1: { problem: 8 } } } },
  "finalRound/teams": { t1: { name: "Lumen", excludedJudges: { j1: true } } },
};

const world = (overrides = {}) => async (r) => {
  const table = { ...WORLD, ...overrides };
  const value = table[r.path];
  return { exists: () => value !== undefined, val: () => value ?? null };
};

const payload = () => mockUpdate.mock.calls.at(-1)[1];

beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockImplementation(world());
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

describe("removalChanges reaches every copy of a person", () => {
  const args = {
    judgesData: WORLD.judges,
    teamsData: WORLD.teams,
    competitorsData: WORLD.competitors,
    scoresData: WORLD.scores,
    finalRoundTeams: WORLD["finalRound/teams"],
  };

  test("a judge comes off the team's schedule card, not just their own record", () => {
    const paths = removalChanges({ uid: "j1", ...args }).map((c) => c.path);
    expect(paths).toContain("judges/j1");
    expect(paths).toContain("teams/t1/schedule/judges");
  });

  test("the remaining judges stay on the card", () => {
    const change = removalChanges({ uid: "j1", ...args })
      .find((c) => c.path === "teams/t1/schedule/judges");
    expect(change.after).toEqual([{ judgeId: "j2", judgeName: "Alan Turing" }]);
  });

  test("a deleted judge is dropped from excludedJudges", () => {
    // otherwise they permanently block a finalist from being judged
    const paths = removalChanges({ uid: "j1", ...args }).map((c) => c.path);
    expect(paths).toContain("finalRound/teams/t1/excludedJudges/j1");
  });

  test("a competitor leaves their team's roster", () => {
    const paths = removalChanges({ uid: "c1", ...args }).map((c) => c.path);
    expect(paths).toContain("competitors/c1");
    expect(paths).toContain("teams/t1/members/c1");
  });

  test("scores are kept unless asked for, because they count toward averages", () => {
    const without = removalChanges({ uid: "j1", ...args }).map((c) => c.path);
    const with_ = removalChanges({ uid: "j1", ...args, includeScores: true }).map((c) => c.path);
    expect(without).not.toContain("scores/first/t1/j1");
    expect(with_).toContain("scores/first/t1/j1");
  });

  test("somebody with no records produces no changes", () => {
    expect(removalChanges({ uid: "nobody", ...args })).toEqual([]);
  });

  test("a legacy array-shaped roster is read too", () => {
    const changes = removalChanges({
      uid: "j1",
      ...args,
      teamsData: { t1: { schedule: { judges: { 0: { judgeId: "j1" }, 1: { judgeId: "j2" } } } } },
    });
    expect(changes.find((c) => c.path === "teams/t1/schedule/judges").after)
      .toEqual([{ judgeId: "j2" }]);
  });
});

describe("listing people", () => {
  test("merges the three role nodes into one row per person", async () => {
    const people = await listPeople();
    const ada = people.find((p) => p.uid === "j1");
    expect(ada.name).toBe("Ada Lovelace");
    expect(ada.roles).toEqual(["judge"]);
  });

  test("an organizer with no profile is still listed", async () => {
    // /admins holds only `true`, so this person has no name anywhere -- and
    // they are exactly who you need to find to revoke
    const people = await listPeople();
    const admin2 = people.find((p) => p.uid === "admin-2");
    expect(admin2).toBeTruthy();
    expect(admin2.roles).toEqual(["admin"]);
    expect(admin2.name).toMatch(/no profile/);
  });

  test("someone can hold more than one role", async () => {
    mockGet.mockImplementation(world({ admins: { j1: true } }));
    const people = await listPeople();
    expect(people.find((p) => p.uid === "j1").roles.sort()).toEqual(["admin", "judge"]);
  });
});

describe("searching", () => {
  const ada = { uid: "j1", name: "Ada Lovelace", email: "ada@example.com" };
  test("matches on name, email and uid", () => {
    expect(matchesQuery(ada, "lovel")).toBe(true);
    expect(matchesQuery(ada, "ADA@")).toBe(true);
    expect(matchesQuery(ada, "j1")).toBe(true);
  });
  test("an empty query matches everyone", () => {
    expect(matchesQuery(ada, "  ")).toBe(true);
  });
  test("a miss is a miss", () => {
    expect(matchesQuery(ada, "turing")).toBe(false);
  });
});

describe("granting and revoking roles", () => {
  test("granting judge writes a blank record, not an empty object", async () => {
    const result = await setRole({ uid: "c1", name: "Grace", role: "judge", enabled: true });
    expect(result.ok).toBe(true);

    const record = payload()["judges/c1"];
    expect(record.isRound1Judge).toBe(false);
    expect(record.checkedIn).toBe(false);
    expect(record.wantsToJudge).toBe(true);
  });

  test("granting a role someone already has is refused", async () => {
    const result = await setRole({ uid: "j1", role: "judge", enabled: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already a judge/);
  });

  test("revoking judge removes their record and their roster entries", async () => {
    await setRole({ uid: "j1", role: "judge", enabled: false });
    const p = payload();
    expect(p["judges/j1"]).toBeNull();
    expect(p["teams/t1/schedule/judges"]).toEqual([{ judgeId: "j2", judgeName: "Alan Turing" }]);
  });

  test("revoking judge leaves a competitor record for the same person alone", async () => {
    mockGet.mockImplementation(world({
      judges: { ...WORLD.judges, c1: { firstName: "Grace" } },
    }));
    await setRole({ uid: "c1", role: "judge", enabled: false });
    expect(payload()["competitors/c1"]).toBeUndefined();
  });

  test("the last organizer cannot be revoked", async () => {
    mockGet.mockImplementation(world({ admins: { "admin-9": true } }));
    const result = await setRole({ uid: "admin-9", role: "admin", enabled: false });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/last organizer/);
  });

  test("you cannot revoke your own organizer access", async () => {
    const result = await setRole({ uid: "admin-1", role: "admin", enabled: false });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/your own/);
  });

  test("an unknown role is refused rather than writing a junk node", async () => {
    expect((await setRole({ uid: "j1", role: "wizard", enabled: true })).ok).toBe(false);
  });
});

describe("deleting a person", () => {
  test("removes every role and says the login survives", async () => {
    const result = await deletePerson({ uid: "j1", name: "Ada" });
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/login still works/i);
    expect(payload()["judges/j1"]).toBeNull();
  });

  test("refuses to delete the signed-in organizer", async () => {
    const result = await deletePerson({ uid: "admin-1" });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("refuses when it would remove the last organizer", async () => {
    mockGet.mockImplementation(world({ admins: { "admin-9": true }, judges: { "admin-9": {} } }));
    const result = await deletePerson({ uid: "admin-9" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/last organizer/);
  });

  test("somebody with nothing recorded is reported, not silently written", async () => {
    const result = await deletePerson({ uid: "ghost" });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("bulk edits", () => {
  test("set one field on many judges in a single update", async () => {
    const result = await bulkSet({ uids: ["j1", "j2"], role: "judge", field: "checkedIn", value: true });
    expect(result.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(payload()["judges/j1/checkedIn"]).toBe(true);
    expect(payload()["judges/j2/checkedIn"]).toBe(true);
  });

  test("people already set that way are left out of the write", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "judges/j1/checkedIn") return { exists: () => true, val: () => true };
      if (r.path === "judges/j2/checkedIn") return { exists: () => true, val: () => false };
      return world()(r);
    });
    await bulkSet({ uids: ["j1", "j2"], role: "judge", field: "checkedIn", value: true });
    expect("judges/j1/checkedIn" in payload()).toBe(false);
    expect(payload()["judges/j2/checkedIn"]).toBe(true);
  });

  test("a field that does not belong to the role is refused", async () => {
    const result = await bulkSet({ uids: ["c1"], role: "competitor", field: "isRound1Judge", value: true });
    expect(result.ok).toBe(false);
  });

  test("an empty selection is refused", async () => {
    expect((await bulkSet({ uids: [], role: "judge", field: "checkedIn", value: true })).ok).toBe(false);
  });
});

describe("deleting a team", () => {
  test("detaches its members rather than orphaning their teamId", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "teams/t1") return { exists: () => true, val: () => WORLD.teams.t1 };
      return world()(r);
    });
    const result = await deleteTeam({ teamId: "t1", teamName: "Lumen" });
    expect(result.ok).toBe(true);
    expect(payload()["teams/t1"]).toBeNull();
    expect(payload()["competitors/c1/teamId"]).toBeNull();
  });

  test("clears every judge's copy of the assignment", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "teams/t1") return { exists: () => true, val: () => WORLD.teams.t1 };
      if (r.path === "judges") {
        return { exists: () => true, val: () => ({ j1: { teamAssignments: { t1: {} }, finalAssignments: { t1: {} } } }) };
      }
      return world()(r);
    });
    await deleteTeam({ teamId: "t1" });
    expect(payload()["judges/j1/teamAssignments/t1"]).toBeNull();
    expect(payload()["judges/j1/finalAssignments/t1"]).toBeNull();
  });

  test("a team that is already gone is reported", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "teams/gone") return { exists: () => false, val: () => null };
      return world()(r);
    });
    expect((await deleteTeam({ teamId: "gone" })).ok).toBe(false);
  });
});

describe("blank records", () => {
  test("a new judge is not in the round one pool and not checked in", () => {
    const judge = blankJudge({ firstName: "New" });
    expect(judge.isRound1Judge).toBe(false);
    expect(judge.checkedIn).toBe(false);
    expect(judge.foodCheckIn).toBe(false);
  });

  test("withCompany follows whether a company was given", () => {
    expect(blankJudge({ company: "CarMax" }).withCompany).toBe(true);
    expect(blankJudge({}).withCompany).toBe(false);
  });

  test("a new competitor has no team and no check-in", () => {
    const competitor = blankCompetitor({ firstName: "New" });
    expect(competitor.checkedIn).toBe(false);
    expect(competitor.teamId).toBeUndefined();
  });
});
