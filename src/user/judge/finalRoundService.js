import { ref, get, update, onValue, serverTimestamp } from "firebase/database";
import { database } from "../../firebase.js";
import { requireAdmin } from "../../roles.js";
import { READ_LEGACY_SCORE_PATH, FIRST_ROUND } from "./getTeamInfo.js";
import { compareForRanking, rankingEntry, scoredJudgeCount } from "./scoreRubric.js";
import { guardWith } from "../admin/snapshots.js";

export const FINAL_ROUND_ROOM = "Rice 011";

/**
 * Below this, an average is not really a ranking — it is one person's opinion.
 * Teams under it are still ranked, but activation reports them so an organizer
 * can send a judge round before the cut is made rather than discovering it
 * afterwards.
 */
export const MIN_JUDGES_FOR_CONFIDENCE = 2;

/**
 * Every first-round card, as { teamId: { judgeUid: card } }.
 *
 * Reads both the current location and the pre-migration one, because averages
 * computed from half the cards would quietly pick the wrong finalists. Drop the
 * legacy branch with READ_LEGACY_SCORE_PATH once the migration is verified.
 */
export async function loadFirstRoundScores(teamsData) {
  const byTeam = {};

  const snap = await get(ref(database, `scores/${FIRST_ROUND}`));
  if (snap.exists()) {
    for (const [teamId, cards] of Object.entries(snap.val() ?? {})) {
      byTeam[teamId] = { ...(cards ?? {}) };
    }
  }

  if (READ_LEGACY_SCORE_PATH && teamsData) {
    for (const [teamId, team] of Object.entries(teamsData)) {
      if (!team?.scores) continue;
      // the migrated copy wins: it is the one the app writes to now
      byTeam[teamId] = { ...team.scores, ...(byTeam[teamId] ?? {}) };
    }
  }

  return byTeam;
}

/**
 * Rank every team that has at least one usable card.
 *
 * Ties are broken explicitly rather than left to sort stability, which would
 * hand the last podium place to whichever team Firebase happened to give the
 * earlier push key.
 */
export function rankTeams(teamsData, scoresByTeam) {
  return Object.entries(teamsData ?? {})
    .map(([teamId, team]) => ({
      ...rankingEntry(teamId, team?.name, scoresByTeam?.[teamId]),
      submitted: Boolean(team?.submitted),
    }))
    .filter((team) => typeof team.averageScore === "number")
    .sort(compareForRanking);
}

/**
 * Judges eligible to work the final round: checked-in round-one judges, or
 * -- if nobody is checked in -- every round-one judge, so a final round is
 * never silently assigned to nobody.
 *
 * This used to iterate every registered judge, so somebody who signed up in
 * October and never turned up still received finalAssignments -- and that
 * node is what the rules treat as proof of assignment for writing a final
 * score. Shared by the planner (to warn if it is empty) and the publisher
 * (to build assignments), so the two cannot disagree about who counts.
 */
function eligibleJudgePool(judgesData) {
  const workingJudges = Object.entries(judgesData)
    .filter(([, judge]) => judge?.isRound1Judge === true && judge?.checkedIn === true)
    .map(([uid]) => uid);
  if (workingJudges.length) return workingJudges;
  return Object.entries(judgesData)
    .filter(([, judge]) => judge?.isRound1Judge === true)
    .map(([uid]) => uid);
}

/**
 * Which of `finalists` would present to an empty room: every judge in
 * `eligiblePool` already scored them in round one, so excluding conflicted
 * judges leaves nobody. Reachable at small events -- with six teams or fewer
 * every judge sees every team.
 */
function orphanedFinalists(finalists, scoresByTeam, eligiblePool) {
  return finalists
    .filter((team) => {
      const excluded = scoresByTeam[team.teamId] ?? {};
      return !eligiblePool.some((uid) => !excluded[uid]);
    })
    .map((team) => team.name);
}

/** The under-judged-finalist warning, or null. */
function underJudgedWarning(finalists) {
  const underJudged = finalists.filter((t) => t.judgeCount < MIN_JUDGES_FOR_CONFIDENCE);
  if (!underJudged.length) return null;
  return (
    `${underJudged.map((t) => t.name).join(", ")} reached the final on fewer than ` +
    `${MIN_JUDGES_FOR_CONFIDENCE} judges.`
  );
}

/**
 * The empty-judge-pool and orphaned-finalist warnings for a candidate
 * finalist set, plus the pool itself so a caller building assignments does
 * not have to recompute it. Shared by planFinalRound (against its own cut)
 * and publishFinalRound (against whatever finalist set the organizer
 * actually confirmed).
 */
function poolWarnings(finalists, scoresByTeam, judgesData) {
  const warnings = [];
  const eligiblePool = eligibleJudgePool(judgesData);

  if (!eligiblePool.length) {
    warnings.push(
      "No judges are marked as first-round judges, so nobody has been given a final-round assignment."
    );
  }

  const orphaned = orphanedFinalists(finalists, scoresByTeam, eligiblePool);
  if (orphaned.length) {
    warnings.push(
      `${orphaned.join(", ")} reached the final round with no eligible judge — every ` +
        `available judge already scored them in round one. Add a judge who did not, or ` +
        `clear an exclusion, or they present to an empty room.`
    );
  }

  return { warnings, eligiblePool };
}

/**
 * Rank every eligible team and cut the top `limit` into a final-round
 * candidate -- the planner half of the plan/publish split. Writes nothing, so
 * an organizer can review the cut, and override which teams are in it,
 * before anything is saved.
 *
 * `basis.cardCounts` -- how many score cards each ranked team carried when
 * this plan was built -- is what `publishFinalRound` re-reads and compares
 * against, to refuse publishing a cut whose averages a card that arrived
 * afterwards has since made wrong.
 *
 * Returns { ok, error?, finalists, ranked, warnings, basis }. Never throws.
 */
export async function planFinalRound({ limit = 4, requireSubmitted = true } = {}) {
  const empty = { finalists: [], ranked: [], warnings: [], basis: { cardCounts: {} } };
  try {
    await requireAdmin("plan the final round");

    const [teamsSnap, judgesSnap] = await Promise.all([
      get(ref(database, "teams")),
      get(ref(database, "judges")),
    ]);
    if (!teamsSnap.exists()) {
      return { ok: false, error: "No teams found to evaluate for the final round", ...empty };
    }

    const teamsData = teamsSnap.val() ?? {};
    const judgesData = judgesSnap.exists() ? judgesSnap.val() ?? {} : {};
    const scoresByTeam = await loadFirstRoundScores(teamsData);

    const ranked = rankTeams(teamsData, scoresByTeam)
      // an unsubmitted team has nothing to present; it used to be eligible
      .filter((team) => (requireSubmitted ? team.submitted : true));

    if (!ranked.length) {
      return {
        ok: false,
        error: "No teams have scores yet. Final round cannot be activated.",
        ...empty,
      };
    }

    const finalists = ranked.slice(0, limit);
    const warnings = [];

    const underJudged = underJudgedWarning(finalists);
    if (underJudged) warnings.push(underJudged);

    // a tie straddling the cut line is the one an organizer has to know about
    const firstOut = ranked[limit];
    if (firstOut && finalists.length === limit) {
      const lastIn = finalists[limit - 1];
      if (lastIn.averageScore === firstOut.averageScore) {
        warnings.push(
          `${lastIn.name} and ${firstOut.name} tied on average; the tiebreak put ` +
            `${lastIn.name} through.`
        );
      }
    }

    warnings.push(...poolWarnings(finalists, scoresByTeam, judgesData).warnings);

    // how many cards each ranked team carried right now, so publishFinalRound
    // can tell a late card apart from a ranking that is simply still current
    const cardCounts = {};
    for (const team of ranked) cardCounts[team.teamId] = team.judgeCount;

    return { ok: true, error: null, finalists, ranked, warnings, basis: { cardCounts } };
  } catch (error) {
    console.error("Error planning the final round:", error);
    return {
      ok: false,
      error: error.message || "Something went wrong planning the final round.",
      ...empty,
    };
  }
}

/**
 * Publishes a final-round activation for `finalists`, as given -- so an
 * organizer's override of `planFinalRound`'s cut is honoured rather than
 * recomputed -- checked against `basis` from that same plan.
 *
 * Before writing anything it re-reads the first-round score cards and
 * compares each finalist's card count against `basis.cardCounts`. A card that
 * arrived since the plan was built moves the average the cut was made from,
 * so any mismatch refuses the publish outright with `staleScores` rather than
 * writing a cut nobody actually reviewed.
 *
 * Writes four things in ONE atomic update, so they cannot drift:
 *   finalRound/*                        the standings, admin-readable only
 *   teams/{id}/finalSlot                the team's own room and time
 *   judges/{uid}/finalAssignments/{id}  what each judge has to see
 *
 * The last two exist because Realtime Database needs read permission at the
 * location being queried, and the standings must not be readable. Denormalising
 * is the same answer the first-round schedule already uses.
 *
 * Returns { ok, error?, staleScores?, warnings, snapshotId }. Never throws.
 */
export async function publishFinalRound({ finalists, basis }) {
  try {
    const user = await requireAdmin("activate the final round");

    if (!finalists?.length) {
      return { ok: false, error: "No finalists to publish.", warnings: [] };
    }

    const [teamsSnap, judgesSnap] = await Promise.all([
      get(ref(database, "teams")),
      get(ref(database, "judges")),
    ]);
    if (!teamsSnap.exists()) {
      return { ok: false, error: "No teams found to evaluate for the final round", warnings: [] };
    }

    const teamsData = teamsSnap.val() ?? {};
    const judgesData = judgesSnap.exists() ? judgesSnap.val() ?? {} : {};
    const scoresByTeam = await loadFirstRoundScores(teamsData);

    // ---- refuse to publish a cut a late card has made stale ----
    const cardCounts = basis?.cardCounts ?? {};
    const stale = finalists.find(
      (team) => scoredJudgeCount(scoresByTeam[team.teamId]) !== (cardCounts[team.teamId] ?? 0)
    );
    if (stale) {
      return {
        ok: false,
        staleScores:
          `${stale.name} has been scored since this ranking was computed. Re-rank before publishing.`,
        warnings: [],
      };
    }

    const warnings = [];
    const underJudged = underJudgedWarning(finalists);
    if (underJudged) warnings.push(underJudged);

    const updates = {};
    const teamsPayload = {};

    finalists.forEach((team, index) => {
      const timeslot = `Slot ${index + 1}`;

      // a judge who already saw this team in round one should not judge it again
      const excludedJudges = Object.keys(scoresByTeam[team.teamId] ?? {}).reduce((acc, uid) => {
        acc[uid] = true;
        return acc;
      }, {});

      teamsPayload[team.teamId] = {
        name: team.name,
        averageScore: team.averageScore,
        fundableVotes: team.fundableVotes,
        judgeCount: team.judgeCount,
        excludedJudges,
        timeslot,
        room: FINAL_ROUND_ROOM,
      };

      updates[`teams/${team.teamId}/finalSlot`] = { room: FINAL_ROUND_ROOM, timeslot };
    });

    // clear any slot left over from a previous activation
    for (const teamId of Object.keys(teamsData)) {
      if (!(teamId in teamsPayload)) updates[`teams/${teamId}/finalSlot`] = null;
    }

    const { warnings: poolW, eligiblePool } = poolWarnings(finalists, scoresByTeam, judgesData);
    warnings.push(...poolW);

    for (const judgeUid of Object.keys(judgesData)) {
      if (!eligiblePool.includes(judgeUid)) {
        updates[`judges/${judgeUid}/finalAssignments`] = null;
        continue;
      }
      const assignments = {};
      for (const [teamId, details] of Object.entries(teamsPayload)) {
        if (details.excludedJudges[judgeUid]) continue;
        assignments[teamId] = {
          teamId,
          teamName: details.name,
          room: details.room,
          timeslot: details.timeslot,
        };
      }
      updates[`judges/${judgeUid}/finalAssignments`] = Object.keys(assignments).length
        ? assignments
        : null;
    }

    const guard = await guardWith({
      label: `Before activating the final round (top ${finalists.length})`,
      reason: "activation rewrites every judge's final assignments and the standings",
      paths: ["teams", "judges", "finalRound"],
    });
    if (!guard.ok) return { ok: false, error: guard.error, warnings };

    updates["finalRound/active"] = true;
    updates["finalRound/activatedAt"] = serverTimestamp();
    updates["finalRound/activatedBy"] = user.uid;
    updates["finalRound/teams"] = teamsPayload;

    await update(ref(database), updates);

    return { ok: true, error: null, staleScores: null, warnings, snapshotId: guard.snapshotId };
  } catch (error) {
    console.error("Error publishing the final round:", error);
    return {
      ok: false,
      error: error.message || "Something went wrong publishing the final round.",
      warnings: [],
    };
  }
}

/**
 * Close the final round.
 *
 * Every denormalised copy is cleared in the same update as the flag. Leaving
 * `finalAssignments` behind would leave every judge holding write access to
 * /scores/final for those teams, because that node is what the rules treat as
 * proof of assignment.
 *
 * The standings are archived rather than deleted. Deactivating used to destroy
 * them outright while the final scores survived underneath, so reactivating
 * recomputed a possibly different finalist set against cards from the old one.
 */
export async function deactivateFinalRound() {
  const user = await requireAdmin("deactivate the final round");

  const [currentSnap, judgesSnap, teamsSnap] = await Promise.all([
    get(ref(database, "finalRound/teams")),
    get(ref(database, "judges")),
    get(ref(database, "teams")),
  ]);

  const updates = {};

  if (currentSnap.exists()) {
    updates[`finalRound/archive/${Date.now()}`] = {
      teams: currentSnap.val(),
      archivedAt: serverTimestamp(),
      archivedBy: user.uid,
    };
  }

  for (const judgeUid of Object.keys(judgesSnap.val() ?? {})) {
    updates[`judges/${judgeUid}/finalAssignments`] = null;
  }
  for (const teamId of Object.keys(teamsSnap.val() ?? {})) {
    updates[`teams/${teamId}/finalSlot`] = null;
  }

  updates["finalRound/active"] = false;
  updates["finalRound/teams"] = null;
  updates["finalRound/deactivatedAt"] = serverTimestamp();
  updates["finalRound/deactivatedBy"] = user.uid;

  await update(ref(database), updates);
  return { ok: true };
}

/**
 * Whether the final round is open. Readable by anyone signed in — it is the
 * only part of /finalRound that is.
 */
export function subscribeToFinalRoundActive(callback) {
  const unsubscribe = onValue(
    ref(database, "finalRound/active"),
    (snapshot) => callback({ active: snapshot.val() === true }),
    (error) => {
      console.error("Failed to subscribe to final round state:", error);
      callback({ active: false, error: error.message });
    }
  );
  return () => unsubscribe();
}

/**
 * The standings, with the average scores. Admin only — mount this behind a role
 * check or every judge logs a permission error on each page load.
 */
export function subscribeToFinalRoundStandings(callback) {
  const unsubscribe = onValue(
    ref(database, "finalRound/teams"),
    (snapshot) => callback({ teams: snapshot.exists() ? snapshot.val() : null }),
    (error) => {
      console.error("Failed to subscribe to final round standings:", error);
      callback({ teams: null, error: error.message });
    }
  );
  return () => unsubscribe();
}
