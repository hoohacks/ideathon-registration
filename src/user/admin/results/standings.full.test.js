/**
 * The results page's tables, pinned row for row, and the edges of what makes
 * a result final. standings.test.js covers each behaviour; this checks every
 * column together and the sort for teams nobody has scored.
 *
 * Scores use only `problem`, so a card of N is worth 4N out of 40.
 */
import { byRank, firstRoundStandings, finalStandings, leadersOf, panelsFrom, standingsState } from "./standings";

describe("ordering", () => {
  test("teams on the same average are listed by name, not by fundable votes", () => {
    const rows = [
      { name: "Zed", teamId: "z", averageScore: 20, fundableVotes: 3, judgeCount: 3 },
      { name: "Abe", teamId: "a", averageScore: 20, fundableVotes: 0, judgeCount: 1 },
    ];
    expect([...rows].sort(byRank).map((r) => r.name)).toEqual(["Abe", "Zed"]);
  });

  test("scored teams come first by their ranking, then unscored ones by name", () => {
    const rows = [
      { name: "Zed" },
      { name: "Low", teamId: "l", averageScore: 10, fundableVotes: 0, judgeCount: 1 },
      { name: "Abe" },
      { name: "High", teamId: "h", averageScore: 30, fundableVotes: 0, judgeCount: 1 },
    ];
    expect([...rows].sort(byRank).map((r) => r.name)).toEqual(["High", "Low", "Abe", "Zed"]);
    expect([...rows].reverse().sort(byRank).map((r) => r.name)).toEqual(["High", "Low", "Abe", "Zed"]);
  });

  test("unscored teams sort by name alone, whatever else their cards carry", () => {
    const zed = { name: "Zed", averageScore: null, fundableVotes: 1, judgeCount: 0 };
    const abe = { name: "Abe", averageScore: null, fundableVotes: 0, judgeCount: 0 };
    expect([zed, abe].sort(byRank).map((r) => r.name)).toEqual(["Abe", "Zed"]);
  });

  test("an unscored team against a scored one sorts after it from either side", () => {
    const scored = { name: "S", averageScore: 1 };
    const unscored = { name: "A" };
    expect(byRank(scored, unscored)).toBe(-1);
    expect(byRank(unscored, scored)).toBe(1);
  });
});

describe("the first round table", () => {
  test("every column for every team", () => {
    const teams = {
      t1: { name: "Lantern", submitted: true, schedule: { time: "5:00 PM", room: "R1", batch: 1, judges: [{ judgeId: "a" }, { judgeId: "b" }] } },
      t2: { name: "Circles", schedule: { judges: [{ judgeId: "a" }] } },
      t3: null,
    };
    const firstScores = { t1: { a: { problem: 9 }, b: { problem: 7 }, x: { problem: 5 } }, t2: { a: {} } };
    expect(firstRoundStandings({ teams, firstScores })).toEqual([
      {
        teamId: "t1", name: "Lantern", averageScore: 28, fundableVotes: 0, judgeCount: 3,
        submitted: true, timeslot: "5:00 PM", room: "R1", batch: 1,
        expected: 2, received: 2, cardsFiled: 3, complete: true,
      },
      {
        teamId: "t2", name: "Circles", averageScore: null, fundableVotes: 0, judgeCount: 0,
        submitted: false, timeslot: null, room: null, batch: null,
        expected: 1, received: 0, cardsFiled: 0, complete: false,
      },
      {
        teamId: "t3", name: "Unnamed Team", averageScore: null, fundableVotes: 0, judgeCount: 0,
        submitted: false, timeslot: null, room: null, batch: null,
        expected: 0, received: 0, cardsFiled: 0, complete: false,
      },
    ]);
  });

  test("defaults to nothing", () => {
    expect(firstRoundStandings()).toEqual([]);
  });
});

describe("the final round table", () => {
  test("every column, with round one kept beside the result", () => {
    const finalRoundTeams = {
      f1: { name: "Lantern", averageScore: 31.5, judgeCount: 3, fundableVotes: 2, timeslot: "Slot 1", room: "Rice 011" },
      f2: null,
    };
    // b has scored nothing, so it is not waited on; f2 has no panel, so it
    // falls back to everyone scoring -- a -- and is waiting on a's card
    const finalScores = { f1: { a: { problem: 8 } } };
    const panels = { f1: ["a", "b"] };
    expect(finalStandings({ finalRoundTeams, finalScores, panels })).toEqual([
      {
        teamId: "f1", name: "Lantern", averageScore: 32, fundableVotes: 0, judgeCount: 1,
        firstRound: { averageScore: 31.5, judgeCount: 3, fundableVotes: 2 },
        timeslot: "Slot 1", room: "Rice 011", expected: 1, received: 1, cardsFiled: 1,
        seated: ["a", "b"], missingJudges: [], notScoring: ["b"], complete: true,
      },
      {
        teamId: "f2", name: "Unnamed Team", averageScore: null, fundableVotes: 0, judgeCount: 0,
        firstRound: { averageScore: null, judgeCount: 0, fundableVotes: 0 },
        timeslot: null, room: null, expected: 1, received: 0, cardsFiled: 0,
        seated: ["a"], missingJudges: ["a"], notScoring: [], complete: false,
      },
    ]);
  });

  test("defaults to nothing", () => {
    expect(finalStandings()).toEqual([]);
  });

  test("panels are read off every judge's final assignments", () => {
    expect(panelsFrom({ a: { finalAssignments: { f1: {}, f2: {} } }, b: { finalAssignments: { f1: {} } }, c: null, d: {} })).toEqual({
      f1: ["a", "b"],
      f2: ["a"],
    });
    expect(panelsFrom()).toEqual({});
  });
});

describe("whether it is settled", () => {
  const row = (name, expected, received, averageScore = 10) => ({ name, expected, received, complete: expected > 0 && received >= expected, averageScore });

  test("sums cards against what is expected and names who is missing how many", () => {
    expect(standingsState([row("A", 3, 3), row("B", 3, 1), row("C", 2, 0)])).toEqual({
      settled: false,
      cards: 4,
      expected: 8,
      waitingOn: [
        { name: "B", missing: 2 },
        { name: "C", missing: 2 },
      ],
      partialJudges: [],
      notScoring: [],
    });
  });

  test("everything in is settled; an empty table is not", () => {
    expect(standingsState([row("A", 2, 2)])).toEqual({
      settled: true, cards: 2, expected: 2, waitingOn: [], partialJudges: [], notScoring: [],
    });
    expect(standingsState([])).toEqual({
      settled: false, cards: 0, expected: 0, waitingOn: [], partialJudges: [], notScoring: [],
    });
  });

  test("the leaders are whoever shares first place, and only scored teams", () => {
    expect(leadersOf([row("A", 1, 1, 12), row("B", 1, 1)]).map((t) => t.name)).toEqual(["A"]);
    expect(leadersOf([row("A", 1, 1), row("B", 1, 0)]).map((t) => t.name)).toEqual(["A", "B"]);
    expect(leadersOf([{ ...row("A", 1, 1), averageScore: null }])).toEqual([]);
    expect(leadersOf([])).toEqual([]);
  });
});
