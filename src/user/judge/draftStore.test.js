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

const plan = (over = {}) => ({
  assignments: {}, basis: { teamIds: [], judgeIds: [], rooms: [], batchCount: 3, batchTimes: {}, target: 3 },
  judgeNames: {}, teamNames: {}, onlyCheckedIn: false, edits: [], version: 0, ...over,
});

beforeEach(() => {
  mockUpdate.mockReset(); mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
});

test("the draft is written to /scheduleDraft and nowhere else", async () => {
  await saveDraft(plan());
  const [, payload] = mockUpdate.mock.calls[0];
  expect(Object.keys(payload)).toEqual(["scheduleDraft"]);
});

test("saving bumps the version", async () => {
  const result = await saveDraft(plan({ version: 3 }));
  expect(result.ok).toBe(true);
  expect(mockUpdate.mock.calls[0][1].scheduleDraft.version).toBe(4);
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
