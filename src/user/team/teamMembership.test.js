/**
 * Joining a team.
 *
 * This had no tests, which is how it shipped broken: `joinTeam` read `submitted`
 * and `members` before letting anyone in, and neither is readable by a
 * non-member — which is who is joining. Every attempt failed with "Could not
 * join that team. Please try again.", and retrying could never work.
 *
 * The reads are mocked per path here rather than wholesale, so a denial can be
 * expressed as what it really is: a rejection from one path while others
 * succeed.
 */
jest.mock("../../firebase", () => ({ database: {} }));

const mockGet = jest.fn();
const mockUpdate = jest.fn();

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "new-team" }),
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "me" } }) }));

const { joinTeam, MAX_TEAM_SIZE } = require("./teamMembership");

/** The world as the rules actually expose it to somebody who is not a member. */
function asNonMember({ name = "Lumen", denyWrite = false, competitor = { firstName: "Alex" } } = {}) {
  mockGet.mockImplementation(async ({ path }) => {
    if (path === "competitors/me/teamId") return snap(null);
    if (path === "competitors/me") return snap(competitor);
    if (path === `teams/t1/name`) return snap(name);
    // the two the rules refuse
    if (path === "teams/t1/submitted" || path === "teams/t1/members") {
      throw new Error("PERMISSION_DENIED: Client doesn't have permission");
    }
    return snap(null);
  });
  mockUpdate.mockImplementation(async () => {
    if (denyWrite) throw new Error("PERMISSION_DENIED: Client doesn't have permission");
  });
}

const snap = (value) => ({ exists: () => value !== null && value !== undefined, val: () => value });

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
});

test("a non-member can join, even though two of the three reads are denied", async () => {
  asNonMember();
  const result = await joinTeam("t1");

  expect(result.ok).toBe(true);
  expect(result.teamName).toBe("Lumen");
  expect(mockUpdate).toHaveBeenCalled();
});

test("both halves of the membership are written together", async () => {
  asNonMember();
  await joinTeam("t1");

  expect(mockUpdate.mock.calls.at(-1)[1]).toEqual({
    "teams/t1/members/me": true,
    "competitors/me/teamId": "t1",
  });
});

test("a refused write on a closed team becomes the sentence about closing", async () => {
  asNonMember({ denyWrite: true });
  const result = await joinTeam("t1");

  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/already submitted its project/);
  expect(result.error).not.toMatch(/try again/i);
});

test("a refused write with no competitor record says that instead", async () => {
  asNonMember({ denyWrite: true, competitor: null });
  const result = await joinTeam("t1");

  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/Only competitors can join/);
});

test("an id nobody has is reported before anything is written", async () => {
  asNonMember({ name: null });
  const result = await joinTeam("t1");

  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/No team found with the ID/);
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("somebody already on a team is stopped first", async () => {
  mockGet.mockImplementation(async ({ path }) =>
    path === "competitors/me/teamId" ? snap("other") : snap(null)
  );
  const result = await joinTeam("t1");

  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/already on a team/);
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("an empty id is refused without a read", async () => {
  const result = await joinTeam("   ");
  expect(result.ok).toBe(false);
  expect(mockGet).not.toHaveBeenCalled();
});

/**
 * When the reader IS allowed — an organizer, or somebody rejoining a team they
 * can still see — the refusal is explained before the attempt rather than after.
 */
describe("when the reads happen to be permitted", () => {
  const asReader = (over) => {
    mockGet.mockImplementation(async ({ path }) => {
      if (path === "competitors/me/teamId") return snap(null);
      if (path === "teams/t1/name") return snap("Lumen");
      if (path === "teams/t1/submitted") return snap(over.submitted ?? null);
      if (path === "teams/t1/members") return snap(over.members ?? null);
      return snap(null);
    });
  };

  test("a submitted team is refused without attempting the write", async () => {
    asReader({ submitted: true });
    const result = await joinTeam("t1");

    expect(result.error).toMatch(/already submitted/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("a full team is refused with the cap named", async () => {
    const members = Object.fromEntries(
      Array.from({ length: MAX_TEAM_SIZE }, (_, i) => [`u${i}`, true])
    );
    asReader({ members });
    const result = await joinTeam("t1");

    expect(result.error).toMatch(new RegExp(`${MAX_TEAM_SIZE} members`));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("a team with room is joined", async () => {
    asReader({ members: { u0: true } });
    expect((await joinTeam("t1")).ok).toBe(true);
  });
});
