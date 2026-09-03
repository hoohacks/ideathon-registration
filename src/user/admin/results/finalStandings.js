import { compareForRanking, rankingEntry, scoredJudgeCount } from "../../judge/scoreRubric.js";

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
 * This ranks the final round the same way the cut was ranked -- same rubric,
 * same explicit tiebreak -- and keeps the first-round numbers beside it, because
 * a team that led the field all day and came second on the night is a thing an
 * organizer wants to see rather than infer.
 *
 * Pure.
 */

/**
 * @param finalRoundTeams the /finalRound/teams node -- who is in the round
 * @param finalScores     /scores/final, as { teamId: { judgeUid: card } }
 * @param panels          { teamId: judgeUid[] } who is expected to score, from
 *                        each judge's finalAssignments
 */
export function finalStandings({ finalRoundTeams = {}, finalScores = {}, panels = {} } = {}) {
  return Object.entries(finalRoundTeams)
    .map(([teamId, standing]) => {
      const cards = finalScores[teamId] ?? {};
      const expected = (panels[teamId] ?? []).length;
      const received = scoredJudgeCount(cards);

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
        expected,
        received,
        // a ranking that is still missing cards is a running total, not a result
        complete: expected > 0 && received >= expected,
      };
    })
    .sort((a, b) => {
      // teams with no final card at all sort last whatever their first-round
      // average was: they have not presented yet
      const aScored = typeof a.averageScore === "number";
      const bScored = typeof b.averageScore === "number";
      if (aScored !== bScored) return aScored ? -1 : 1;
      if (!aScored) return String(a.name).localeCompare(String(b.name));
      return compareForRanking(a, b);
    });
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
 */
export function standingsState(standings) {
  const outstanding = standings.filter((team) => !team.complete);
  const cards = standings.reduce((sum, team) => sum + team.received, 0);
  const expected = standings.reduce((sum, team) => sum + team.expected, 0);

  return {
    settled: standings.length > 0 && outstanding.length === 0,
    cards,
    expected,
    waitingOn: outstanding.map((team) => ({
      name: team.name,
      missing: Math.max(0, team.expected - team.received),
    })),
  };
}

/**
 * The winner, or null while it is still a tie nobody has broken.
 *
 * `compareForRanking` is a total order, so there is always a first row -- but a
 * first row and a winner are not the same claim while cards are outstanding.
 */
export function winnerOf(standings) {
  const [first] = standings;
  if (!first || typeof first.averageScore !== "number") return null;
  return standingsState(standings).settled ? first : null;
}
