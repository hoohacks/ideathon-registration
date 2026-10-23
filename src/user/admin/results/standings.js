import { rankingEntry, sameAverage, scoreCard, scoredJudgeCount } from "../../judge/scoreRubric.js";
import { rosterOf } from "../../judge/assignmentList.js";
import { compareSlots } from "../../judge/finalRoundPlan.js";

/**
 * Who won.
 *
 * Nothing in the app answered that. The final round wrote its standings to
 * `/finalRound/teams` and no screen read them -- `subscribeToFinalRoundStandings`
 * was exported and never imported. Worse, those standings carry the *first*
 * round's averages, frozen at the moment the cut was made, and nothing updates
 * them as final scores arrive. So the day built to a decision the app could not
 * show you: to find the winner you exported the final round's raw cards and did
 * the arithmetic yourself.
 *
 * This ranks the final round on the same rubric the cut was made on and keeps
 * the first-round numbers beside it, because a team that led the field all day
 * and came second on the night is a thing an organizer wants to see rather than
 * infer.
 *
 * Two rules shape what it will claim:
 *
 * - **Nobody is waited on who is not scoring.** Every checked-in judge is seated
 *   on every finalist, and on the night one or two of them will step out. A
 *   result that waits for the whole seated panel never arrives. So a team is
 *   only waiting on judges who have filed a final card for *some* finalist --
 *   whoever has not scored anybody is not counted, and is named so an organizer
 *   can see who that is.
 * - **A tie is a tie.** Places are shared between teams on the same average
 *   (`sameAverage`); nothing past the average decides a place here. Fundable
 *   votes and the team name still order the cut, where something has to be
 *   first, but the winner is organizers' call when the scores do not make it.
 *
 * Pure.
 */

/**
 * The order a ranking is read in, for either round.
 *
 * Best average first. A team with no card at all goes last whatever it did in
 * the other round, because it has not been heard yet -- a team that led the
 * field all day and has not presented tonight is not in first place, and it is
 * not in last place either.
 *
 * Teams on the same average are listed by name, which is only a reading order:
 * `placesOf` gives them the same place. Both rounds share this so the two tabs
 * cannot drift into ranking by different rules.
 */
export function byRank(a, b) {
  const aScored = typeof a.averageScore === "number";
  const bScored = typeof b.averageScore === "number";
  if (aScored !== bScored) return aScored ? -1 : 1;
  if (aScored && !sameAverage(a.averageScore, b.averageScore)) return b.averageScore - a.averageScore;

  const byName = String(a.name ?? "").localeCompare(String(b.name ?? ""), "en");
  if (byName !== 0) return byName;
  const left = String(a.teamId ?? "");
  const right = String(b.teamId ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Each team's place, shared on a tie: two teams level for second are both
 * second, and the next team is fourth. A team with no card has no place.
 *
 * Expects rows already sorted with `byRank`. Returns a new array; each row gains
 * `place` (a number or null) and `tied` (whether another team shares it).
 */
export function placesOf(standings) {
  const scored = standings.filter((team) => typeof team.averageScore === "number");
  return standings.map((team) => {
    if (typeof team.averageScore !== "number") return { ...team, place: null, tied: false };
    const ahead = scored.filter(
      (other) => other.averageScore > team.averageScore && !sameAverage(other.averageScore, team.averageScore)
    ).length;
    const level = scored.filter((other) => sameAverage(other.averageScore, team.averageScore)).length;
    return { ...team, place: ahead + 1, tied: level > 1 };
  });
}

/**
 * The first round, ranked.
 *
 * Same rubric and same tiebreak as the final, so the standing a team is shown
 * here is the standing the cut was made on. The panel comes off the team's own
 * schedule roster rather than the judges' assignment lists -- that roster is
 * what the judging page counts against, and counting `received` over a
 * different population is how a team gets marked complete that a judge on its
 * panel has not actually scored.
 *
 * @param teams       the /teams node
 * @param firstScores /scores/first, as { teamId: { judgeUid: card } }
 */
export function firstRoundStandings({ teams = {}, firstScores = {} } = {}) {
  return Object.entries(teams)
    .map(([teamId, team]) => {
      const cards = firstScores[teamId] ?? {};
      const assigned = rosterOf(team?.schedule).map((entry) => entry.judgeId);
      const expected = assigned.length;
      const received = assigned.filter((judgeId) => scoreCard(cards[judgeId]) !== null).length;

      return {
        ...rankingEntry(teamId, team?.name, cards),
        submitted: Boolean(team?.submitted),
        timeslot: team?.schedule?.time ?? null,
        room: team?.schedule?.room ?? null,
        batch: team?.schedule?.batch ?? null,
        expected,
        received,
        cardsFiled: scoredJudgeCount(cards),
        complete: expected > 0 && received >= expected,
      };
    })
    .sort(byRank);
}

/**
 * The final round, ranked, with what each team is still waiting on.
 *
 * @param finalRoundTeams the /finalRound/teams node -- who is in the round
 * @param finalScores     /scores/final, as { teamId: { judgeUid: card } }
 * @param panels          { teamId: judgeUid[] } who is seated on each team, from
 *                        each judge's finalAssignments while the round is open.
 *                        Closing the round withdraws those, so a team missing
 *                        here falls back to the panel publishing stored on its
 *                        standing.
 */
export function finalStandings({ finalRoundTeams = {}, finalScores = {}, panels = {} } = {}) {
  const teamIds = Object.keys(finalRoundTeams ?? {});

  // whoever has filed a final card for any finalist is scoring tonight; the
  // rest of the seated panel has stepped out or not started, and is not waited on
  const scoring = new Set();
  for (const teamId of teamIds) {
    for (const [judgeId, entry] of Object.entries(finalScores[teamId] ?? {})) {
      if (scoreCard(entry) !== null) scoring.add(judgeId);
    }
  }

  return teamIds
    .map((teamId) => {
      const standing = finalRoundTeams[teamId];
      const cards = finalScores[teamId] ?? {};
      const seated = seatedOn(teamId, standing, panels, scoring);
      // `expected` and `received` are counts over the same population -- the
      // seated judges who are scoring -- or a card from a judge who isn't on
      // the panel could stand in for a seated judge's still-missing one
      const counted = seated.filter((judgeId) => scoring.has(judgeId));
      const missing = counted.filter((judgeId) => scoreCard(cards[judgeId]) === null);
      const received = counted.length - missing.length;
      // raw card count, not scoped to the panel -- the proof of work that
      // survives whatever happened to the assignments
      const cardsFiled = scoredJudgeCount(cards);

      return {
        ...rankingEntry(teamId, standing?.name, cards),
        // what the cut was made on, kept beside the result rather than
        // overwritten by it
        firstRound: {
          averageScore: standing?.averageScore ?? null,
          judgeCount: standing?.judgeCount ?? 0,
          fundableVotes: standing?.fundableVotes ?? 0,
        },
        timeslot: standing?.timeslot ?? null,
        room: standing?.room ?? null,
        expected: counted.length,
        received,
        cardsFiled,
        seated,
        missingJudges: missing,
        notScoring: seated.filter((judgeId) => !scoring.has(judgeId)),
        // a ranking that is still missing cards is a running total, not a result
        complete: counted.length > 0 && missing.length === 0,
      };
    })
    .sort(byRank);
}

/**
 * Who is seated on one finalist: the live assignments while the round is open,
 * else the panel stored on the standing at publish, else -- for a round
 * published before panels were stored -- everyone who scored any finalist.
 */
function seatedOn(teamId, standing, panels, scoring) {
  if (panels[teamId]?.length) return [...panels[teamId]];
  const stored = Object.keys(standing?.panel ?? {});
  if (stored.length) return stored;
  return [...scoring];
}

/** Who is expected to score each finalist, read off the judges' assignments. */
export function panelsFrom(judges = {}) {
  const panels = {};
  for (const [judgeId, judge] of Object.entries(judges)) {
    for (const teamId of Object.keys(judge?.finalAssignments ?? {})) {
      (panels[teamId] = panels[teamId] ?? []).push(judgeId);
    }
  }
  return panels;
}

/**
 * Whether these standings are final, and what is still missing if not.
 *
 * An organizer about to announce a winner needs to know the difference between
 * "this is the result" and "this is the result so far", and the gap between
 * them is usually one judge who has not pressed submit.
 *
 * Alongside the per-team gaps, two lists about judges, for the final round:
 *
 * - `partialJudges`: scoring judges who have not scored every team they sit on.
 *   Until they do, the teams they did score have an average with them in it
 *   and the others do not -- worth knowing before announcing anything.
 * - `notScoring`: seated judges with no final card at all. They are not waited
 *   on; this is so an organizer can see who that leaves out, and catch the
 *   judge who is still writing their first card rather than gone.
 *
 * First-round rows carry neither, so both come back empty there.
 */
export function standingsState(standings) {
  const outstanding = standings.filter((team) => !team.complete);
  const expected = standings.reduce((sum, team) => sum + team.expected, 0);
  const cards = standings.reduce((sum, team) => sum + team.received, 0);

  const owed = new Map();
  const seatedCount = new Map();
  const notScoring = new Set();
  // in running order, not ranking order, so "still owes Tandem, Almanac and
  // Kindling" reads the way the judge will meet those teams. First-round
  // times are not slot labels, so compareSlots leaves them where they are.
  const inRunningOrder = [...standings].sort((a, b) => compareSlots(a.timeslot, b.timeslot));
  for (const team of inRunningOrder) {
    for (const judgeId of team.seated ?? []) {
      seatedCount.set(judgeId, (seatedCount.get(judgeId) ?? 0) + 1);
    }
    for (const judgeId of team.missingJudges ?? []) {
      owed.set(judgeId, [...(owed.get(judgeId) ?? []), team.name]);
    }
    for (const judgeId of team.notScoring ?? []) notScoring.add(judgeId);
  }

  return {
    settled: standings.length > 0 && outstanding.length === 0,
    cards,
    expected,
    waitingOn: outstanding.map((team) => ({
      name: team.name,
      missing: Math.max(0, team.expected - team.received),
    })),
    partialJudges: [...owed].map(([judgeId, teams]) => ({
      judgeId,
      scored: (seatedCount.get(judgeId) ?? 0) - teams.length,
      of: seatedCount.get(judgeId) ?? 0,
      missing: teams,
    })),
    notScoring: [...notScoring],
  };
}

/**
 * The teams in first place: one when the scores decide it, several when they
 * tie, none before anybody has been scored.
 *
 * Says nothing about whether that is the result yet -- that is
 * `standingsState`'s question, and the page asks both.
 */
export function leadersOf(standings) {
  const placed = placesOf(standings);
  return placed.filter((team) => team.place === 1);
}
