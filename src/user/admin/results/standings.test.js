/**
 * The result of the event.
 *
 * The app used to have no answer to "who won": the standings node carried the
 * first round's averages and no screen read it. The thing worth pinning here is
 * the distinction between a running total and a result -- an organizer about to
 * announce a winner must not be shown a first row that is only first because
 * somebody has not pressed submit yet.
 */
import {
  finalStandings, firstRoundStandings, leadersOf, panelsFrom, placesOf, standingsState,
} from "./standings";

const card = (problem) => ({
  problem,
  innovation: problem,
  impact: problem,
  viability: problem / 2,
  pitch_quality: problem / 2,
  fundable: true,
});

const finalRoundTeams = {
  t1: { name: "Alpha", averageScore: 38, judgeCount: 3, fundableVotes: 3, timeslot: "Slot 1" },
  t2: { name: "Beta", averageScore: 36, judgeCount: 3, fundableVotes: 2, timeslot: "Slot 2" },
  t3: { name: "Gamma", averageScore: 34, judgeCount: 2, fundableVotes: 1, timeslot: "Slot 3" },
};

const panels = { t1: ["j1", "j2"], t2: ["j1", "j2"], t3: ["j1", "j2"] };

describe("reading the panels off the judges", () => {
  test("a judge's final assignments say who is expected to score what", () => {
    const judges = {
      j1: { finalAssignments: { t1: {}, t2: {} } },
      j2: { finalAssignments: { t1: {} } },
      j3: {},
    };
    expect(panelsFrom(judges)).toEqual({ t1: ["j1", "j2"], t2: ["j1"] });
  });

  test("nobody assigned is an empty map, not a crash", () => {
    expect(panelsFrom()).toEqual({});
  });
});

describe("ranking the final round", () => {
  test("it ranks on the final cards, not the ones the cut was made from", () => {
    // Gamma was third going in and wins on the night
    const finalScores = {
      t1: { j1: card(6), j2: card(6) },
      t2: { j1: card(7), j2: card(7) },
      t3: { j1: card(9), j2: card(9) },
    };
    const standings = finalStandings({ finalRoundTeams, finalScores, panels });
    expect(standings.map((t) => t.name)).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  test("the first-round numbers are kept beside the result, not overwritten", () => {
    const finalScores = { t3: { j1: card(9), j2: card(9) } };
    const gamma = finalStandings({ finalRoundTeams, finalScores, panels })
      .find((t) => t.name === "Gamma");

    expect(gamma.firstRound.averageScore).toBe(34);
    expect(gamma.averageScore).toBeGreaterThan(34);
  });

  test("a team nobody has scored yet sorts last, whatever it did in round one", () => {
    // Alpha led the first round and has not presented
    const finalScores = { t2: { j1: card(5), j2: card(5) }, t3: { j1: card(4), j2: card(4) } };
    const standings = finalStandings({ finalRoundTeams, finalScores, panels });
    expect(standings.at(-1).name).toBe("Alpha");
  });

  test("it counts what is in against what is expected, per team", () => {
    // both judges are scoring -- j2 has filed for Beta -- so Alpha owes j2 a card
    const finalScores = { t1: { j1: card(8) }, t2: { j2: card(8) } };
    const alpha = finalStandings({ finalRoundTeams, finalScores, panels }).find((t) => t.name === "Alpha");

    expect(alpha.received).toBe(1);
    expect(alpha.expected).toBe(2);
    expect(alpha.missingJudges).toEqual(["j2"]);
    expect(alpha.complete).toBe(false);
  });

  test("a card from a judge who is not on the panel does not count as received", () => {
    // j9 is not in t1's panel -- its card must not stand in for j2's
    const finalScores = { t1: { j1: card(8), j9: card(8) }, t2: { j2: card(8) } };
    const alpha = finalStandings({ finalRoundTeams, finalScores, panels }).find((t) => t.name === "Alpha");

    expect(alpha.received).toBe(1);
    expect(alpha.expected).toBe(2);
    expect(alpha.complete).toBe(false);
  });
});

describe("a running total is not a result", () => {
  const complete = {
    t1: { j1: card(9), j2: card(9) },
    t2: { j1: card(7), j2: card(7) },
    t3: { j1: card(5), j2: card(5) },
  };

  test("every card in is settled, and has a winner", () => {
    const standings = finalStandings({ finalRoundTeams, finalScores: complete, panels });
    expect(standingsState(standings).settled).toBe(true);
    expect(leadersOf(standings).map((t) => t.name)).toEqual(["Alpha"]);
  });

  test("one card missing is not settled, and names who it is waiting on", () => {
    const finalScores = { ...complete, t2: { j1: card(7) } };
    const standings = finalStandings({ finalRoundTeams, finalScores, panels });
    const state = standingsState(standings);

    expect(state.settled).toBe(false);
    expect(state.waitingOn).toEqual([{ name: "Beta", missing: 1 }]);
    expect(state.partialJudges).toEqual([{ judgeId: "j2", scored: 2, of: 3, missing: ["Beta"] }]);
  });

  test("the leader is shown while a card is outstanding, but it is not settled", () => {
    const finalScores = { ...complete, t2: { j1: card(7) } };
    const standings = finalStandings({ finalRoundTeams, finalScores, panels });

    expect(leadersOf(standings).map((t) => t.name)).toEqual(["Alpha"]);
    expect(standingsState(standings).settled).toBe(false);
  });

  test("a card from an off-panel judge does not settle the round or crown a winner", () => {
    // t2's real panel is j1 and j2; j9 is scoring a team it was never assigned
    const finalScores = { ...complete, t2: { j1: card(7), j9: card(7) } };
    const standings = finalStandings({ finalRoundTeams, finalScores, panels });
    const state = standingsState(standings);

    expect(state.settled).toBe(false);
    expect(state.waitingOn).toEqual([{ name: "Beta", missing: 1 }]);
  });

  test("nothing scored at all has no leader rather than an arbitrary one", () => {
    const standings = finalStandings({ finalRoundTeams, finalScores: {}, panels });
    expect(leadersOf(standings)).toEqual([]);
    expect(standingsState(standings).cards).toBe(0);
    expect(standingsState(standings).settled).toBe(false);
  });

  test("no final round at all is an empty result, not a throw", () => {
    expect(finalStandings()).toEqual([]);
    expect(standingsState([]).settled).toBe(false);
    expect(leadersOf([])).toEqual([]);
  });
});

/**
 * Judges step out. Every checked-in judge is seated on every finalist, and the
 * result cannot wait for somebody who has gone home -- so a judge who has not
 * scored any finalist is not waited on, and is named instead.
 */
describe("a judge who steps out", () => {
  const seated = { t1: ["j1", "j2", "j3"], t2: ["j1", "j2", "j3"], t3: ["j1", "j2", "j3"] };
  const twoJudges = {
    t1: { j1: card(9), j2: card(9) },
    t2: { j1: card(7), j2: card(7) },
    t3: { j1: card(5), j2: card(5) },
  };

  test("before scoring anybody is not waited on, and the round settles without them", () => {
    const standings = finalStandings({ finalRoundTeams, finalScores: twoJudges, panels: seated });
    const state = standingsState(standings);

    expect(state.settled).toBe(true);
    expect(state.notScoring).toEqual(["j3"]);
    expect(standings.every((team) => team.expected === 2)).toBe(true);
  });

  test("after scoring some finalists is still waited on for the rest", () => {
    const finalScores = { ...twoJudges, t1: { ...twoJudges.t1, j3: card(8) } };
    const state = standingsState(finalStandings({ finalRoundTeams, finalScores, panels: seated }));

    expect(state.settled).toBe(false);
    expect(state.partialJudges).toEqual([{ judgeId: "j3", scored: 1, of: 3, missing: ["Beta", "Gamma"] }]);
    expect(state.notScoring).toEqual([]);
  });

  test("a judge taken off one panel is not waited on for that team", () => {
    const panelsWithout = { ...seated, t3: ["j1", "j2"] };
    const finalScores = {
      t1: { j1: card(9), j2: card(9), j3: card(9) },
      t2: { j1: card(7), j2: card(7), j3: card(7) },
      t3: { j1: card(5), j2: card(5) },
    };
    const state = standingsState(finalStandings({ finalRoundTeams, finalScores, panels: panelsWithout }));
    expect(state.settled).toBe(true);
  });
});

/**
 * Closing the round withdraws every judge's finalAssignments. The standings
 * keep the panel publishing stored, so a closed round can still say whose
 * cards it was waiting on.
 */
describe("a closed round", () => {
  test("reads the panel stored on each standing once the assignments are gone", () => {
    const stored = Object.fromEntries(
      Object.entries(finalRoundTeams).map(([id, team]) => [id, { ...team, panel: { j1: true, j2: true } }])
    );
    const finalScores = { t1: { j1: card(9), j2: card(9) }, t2: { j1: card(7) }, t3: { j1: card(5), j2: card(5) } };
    const standings = finalStandings({ finalRoundTeams: stored, finalScores, panels: {} });
    const beta = standings.find((t) => t.name === "Beta");

    expect(beta.expected).toBe(2);
    expect(beta.missingJudges).toEqual(["j2"]);
  });
});

/**
 * A tie is a tie. Fundable votes and the alphabet still order the cut, where
 * somebody has to be first, but on the results page teams level on average
 * share the place and a shared first place names nobody the winner.
 */
describe("ties", () => {
  test("two teams level on average are both first, and both lead", () => {
    const finalScores = {
      t1: { j1: card(8), j2: card(8) },
      t2: { j1: card(8), j2: card(8) },
      t3: { j1: card(5), j2: card(5) },
    };
    const standings = placesOf(finalStandings({ finalRoundTeams, finalScores, panels }));

    expect(standings.map((t) => [t.name, t.place, t.tied])).toEqual([
      ["Alpha", 1, true],
      ["Beta", 1, true],
      ["Gamma", 3, false],
    ]);
    expect(leadersOf(standings).map((t) => t.name)).toEqual(["Alpha", "Beta"]);
  });

  test("fundable votes do not break a tie", () => {
    const noFund = (n) => ({ ...card(n), fundable: false });
    // Beta has every fundable vote; it is still level with Alpha, not ahead
    const finalScores = {
      t1: { j1: noFund(8), j2: noFund(8) },
      t2: { j1: card(8), j2: card(8) },
    };
    const standings = finalStandings({ finalRoundTeams, finalScores, panels });
    expect(leadersOf(standings).map((t) => t.name)).toEqual(["Alpha", "Beta"]);
  });

  test("a gap too small to see is still a tie", () => {
    const rows = placesOf([
      { teamId: "a", name: "A", averageScore: 31.2500001 },
      { teamId: "b", name: "B", averageScore: 31.25 },
      { teamId: "c", name: "C", averageScore: 30 },
      { teamId: "d", name: "D", averageScore: null },
    ]);
    expect(rows.map((t) => [t.name, t.place, t.tied])).toEqual([
      ["A", 1, true],
      ["B", 1, true],
      ["C", 3, false],
      ["D", null, false],
    ]);
  });
});

/**
 * A panel nobody is assigned to is not a finished panel.
 *
 * Deactivating the final round wipes every judge's `finalAssignments`, which is
 * the population `received` and `expected` are counted over. The page no longer
 * reads a round that is not running, so this is only about the live case: an
 * open round where the plan has not seated anybody yet.
 */
describe("a round with no panels", () => {
  test("is not settled just because nobody is assigned", () => {
    const standings = finalStandings({
      finalRoundTeams,
      finalScores: { t1: { j1: card(9) } },
      panels: {},
    });
    expect(standingsState(standings).settled).toBe(false);
  });

  test("still counts the cards that were filed", () => {
    const standings = finalStandings({
      finalRoundTeams,
      finalScores: { t1: { j1: card(9) }, t2: { j1: card(7) } },
      panels: {},
    });
    expect(standings.reduce((sum, team) => sum + team.cardsFiled, 0)).toBe(2);
  });
});

/**
 * The first round, ranked by the same rule.
 *
 * The panel is the team's own schedule roster rather than the judges'
 * assignment lists, because that roster is what the judging page counts
 * against -- two populations would let a team read as fully scored on one page
 * and short a card on the other.
 */
describe("the first round", () => {
  const roster = (...ids) => ({ judges: ids.map((judgeId) => ({ judgeId })) });
  const teams = {
    a: { name: "Alpha", schedule: { batch: 1, time: "5:00 PM", room: "Rice 340", ...roster("j1", "j2") } },
    b: { name: "Bravo", schedule: { batch: 1, time: "5:00 PM", room: "Rice 342", ...roster("j1", "j2") } },
    c: { name: "Cosmo", schedule: { batch: 2, time: "5:15 PM", room: "Rice 340", ...roster("j1") } },
  };

  test("ranks by average, best first", () => {
    const standings = firstRoundStandings({
      teams,
      firstScores: { a: { j1: card(6) }, b: { j1: card(9) }, c: { j1: card(7) } },
    });
    expect(standings.map((team) => team.name)).toEqual(["Bravo", "Cosmo", "Alpha"]);
  });

  test("a team nobody has scored sorts last, by name, without a place", () => {
    const standings = firstRoundStandings({
      teams,
      firstScores: { b: { j1: card(9) } },
    });
    expect(standings.map((team) => team.name)).toEqual(["Bravo", "Alpha", "Cosmo"]);
    expect(standings[1].averageScore).toBeNull();
  });

  test("counts expected against the roster, not against whoever filed a card", () => {
    const standings = firstRoundStandings({
      teams,
      // j9 is not on Alpha's roster: the card counts toward the average but
      // cannot stand in for j2's missing one
      firstScores: { a: { j1: card(8), j9: card(8) } },
    });
    const alpha = standings.find((team) => team.name === "Alpha");
    expect(alpha.expected).toBe(2);
    expect(alpha.received).toBe(1);
    expect(alpha.complete).toBe(false);
    expect(alpha.cardsFiled).toBe(2);
  });

  test("every judge on the roster in is a complete team", () => {
    const standings = firstRoundStandings({
      teams,
      firstScores: { c: { j1: card(7) } },
    });
    expect(standings.find((team) => team.name === "Cosmo").complete).toBe(true);
  });

  test("carries where the team presented, for checking a surprising score", () => {
    const [top] = firstRoundStandings({ teams, firstScores: { a: { j1: card(9) } } });
    expect(top.batch).toBe(1);
    expect(top.timeslot).toBe("5:00 PM");
    expect(top.room).toBe("Rice 340");
  });

  test("a team with no schedule at all is ranked, not dropped", () => {
    const standings = firstRoundStandings({
      teams: { z: { name: "Zulu" } },
      firstScores: { z: { j1: card(9) } },
    });
    expect(standings[0].name).toBe("Zulu");
    expect(standings[0].expected).toBe(0);
  });

  test("no teams at all is an empty result, not a throw", () => {
    expect(firstRoundStandings()).toEqual([]);
  });
});
