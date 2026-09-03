/**
 * Closing the tab is the one action that can still lose a score.
 *
 * A queued card syncs only while the judging page is open: it lives on that
 * device, nobody else can see it, and Judging progress reports the team as
 * unjudged. The browser offers one guard against that, and this asserts it is
 * armed when there is something to lose and not otherwise -- a page that asks
 * "are you sure?" when nothing is queued teaches people to dismiss it.
 */
import { renderHook } from "@testing-library/react";

jest.mock("../../firebase", () => ({ database: {} }));
jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  onValue: (_ref, cb) => {
    cb({ val: () => true });
    return () => {};
  },
}));

const mockList = jest.fn(() => []);
jest.mock("./pendingScores.js", () => ({
  listPending: (...args) => mockList(...args),
  subscribeToPending: () => () => {},
}));
jest.mock("./getTeamInfo.js", () => ({ syncPendingScores: jest.fn(async () => ({ synced: 0, failed: 0 })) }));

const { useJudgingSync } = require("./useJudgingSync");

function listenerCount() {
  return added.filter((name) => name === "beforeunload").length -
    removed.filter((name) => name === "beforeunload").length;
}

let added = [];
let removed = [];
let addSpy;
let removeSpy;

beforeEach(() => {
  added = [];
  removed = [];
  addSpy = jest.spyOn(window, "addEventListener").mockImplementation((name, fn, opts) => {
    added.push(name);
    return Window.prototype.addEventListener.call(window, name, fn, opts);
  });
  removeSpy = jest.spyOn(window, "removeEventListener").mockImplementation((name, fn, opts) => {
    removed.push(name);
    return Window.prototype.removeEventListener.call(window, name, fn, opts);
  });
});

afterEach(() => {
  addSpy.mockRestore();
  removeSpy.mockRestore();
  mockList.mockReset();
});

test("nothing queued asks nothing on the way out", () => {
  mockList.mockReturnValue([]);
  renderHook(() => useJudgingSync("j1"));
  expect(listenerCount()).toBe(0);
});

test("a queued card arms the browser's leave warning", () => {
  mockList.mockReturnValue([{ teamId: "t1", round: "first", judgeUid: "j1" }]);
  renderHook(() => useJudgingSync("j1"));
  expect(listenerCount()).toBe(1);
});

test("the warning is taken down when the page goes", () => {
  mockList.mockReturnValue([{ teamId: "t1", round: "first", judgeUid: "j1" }]);
  const { unmount } = renderHook(() => useJudgingSync("j1"));
  unmount();
  expect(listenerCount()).toBe(0);
});
