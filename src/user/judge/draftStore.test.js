jest.mock("../../firebase", () => ({ database: {}, auth: {} }));
const mockUpdate = jest.fn();
const mockGet = jest.fn();
jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path: path ?? "" }),
  get: (...a) => mockGet(...a),
  update: (...a) => mockUpdate(...a),
  onValue: jest.fn(() => jest.fn()),
  serverTimestamp: () => 1700000000000,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));
jest.mock("../admin/adminAction.js", () => ({ resolveName: async () => "Sam" }));

const { readDraft, saveDraft, clearDraft } = require("./draftStore");
const { requireAdmin } = require("../../roles.js");

const plan = (over = {}) => ({
  assignments: {}, basis: { teamIds: [], judgeIds: [], rooms: [], batchCount: 3, batchTimes: {}, target: 3 },
  judgeNames: {}, teamNames: {}, onlyCheckedIn: false, edits: [], version: 0, ...over,
});

/**
 * create-react-app sets `resetMocks: true`, which strips the implementation
 * off every jest.fn before each test -- so `requireAdmin`'s mocked resolution
 * from the jest.mock factory above is gone by the time the first test runs
 * unless it is re-established here. See adminAction.test.js for the same note.
 */
beforeEach(() => {
  mockUpdate.mockReset(); mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

test("the draft is written to /scheduleDraft and nowhere else", async () => {
  await saveDraft(plan());
  const [, payload] = mockUpdate.mock.calls[0];
  expect(Object.keys(payload)).toEqual(["scheduleDraft"]);
});

test("saving bumps the version", async () => {
  // A version above 0 needs a matching stored draft, or saveDraft now reads
  // it as "this draft was discarded" and refuses -- see the two tests below.
  mockGet.mockResolvedValue({
    exists: () => true,
    val: () => ({ version: 3, createdByName: "Sam" }),
  });
  const result = await saveDraft(plan({ version: 3 }));
  expect(result.ok).toBe(true);
  expect(mockUpdate.mock.calls[0][1].scheduleDraft.version).toBe(4);
});

test("a fresh plan at version 0 saves when nothing is stored", async () => {
  const result = await saveDraft(plan({ version: 0 }));
  expect(result.ok).toBe(true);
  expect(mockUpdate).toHaveBeenCalledTimes(1);
});

test("a stale plan with nothing stored is refused, not resurrected as a first save", async () => {
  const result = await saveDraft(plan({ version: 3 }));
  expect(result.ok).toBe(false);
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("a stale version is refused and names who moved it", async () => {
  mockGet.mockResolvedValue({
    exists: () => true,
    val: () => ({ version: 7, createdByName: "Sam" }),
  });
  const result = await saveDraft(plan({ version: 3 }));
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/Sam/);
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("reading an absent draft is null, not an error", async () => {
  expect(await readDraft()).toBeNull();
});

test("edits round-trip through the keyed shape", async () => {
  const withEdit = plan({
    edits: [{ op: { type: "addJudge", teamId: "t1", judgeUid: "j1" }, summary: "Added Bo to A", before: null }],
  });
  await saveDraft(withEdit);
  const stored = mockUpdate.mock.calls[0][1].scheduleDraft;
  expect(Array.isArray(stored.edits)).toBe(false);
  mockGet.mockResolvedValue({ exists: () => true, val: () => stored });
  const back = await readDraft();
  expect(back.edits).toHaveLength(1);
  expect(back.edits[0].summary).toBe("Added Bo to A");
});

test("clearing writes a null", async () => {
  await clearDraft();
  expect(mockUpdate.mock.calls[0][1]).toEqual({ scheduleDraft: null });
});

test("a non-admin gets null from readDraft, not a thrown error", async () => {
  requireAdmin.mockRejectedValueOnce(new Error("Only an organizer can read the schedule draft"));
  expect(await readDraft()).toBeNull();
});

test("a non-admin's save is refused and writes nothing", async () => {
  requireAdmin.mockRejectedValueOnce(new Error("Only an organizer can save the schedule draft"));
  const result = await saveDraft(plan());
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/organizer/);
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("a non-admin's clear is refused and writes nothing", async () => {
  requireAdmin.mockRejectedValueOnce(new Error("Only an organizer can clear the schedule draft"));
  const result = await clearDraft();
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/organizer/);
  expect(mockUpdate).not.toHaveBeenCalled();
});
