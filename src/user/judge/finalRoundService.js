import { ref, get, update, onValue, serverTimestamp } from "firebase/database";
import { database } from "../../firebase.js";
import { requireAdmin } from "../../roles.js";
import { READ_LEGACY_SCORE_PATH, FIRST_ROUND } from "./getTeamInfo.js";
import { compareForRanking, rankingEntry } from "./scoreRubric.js";
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
 * Take the top `limit` teams into the final round.
 *
 * Writes four things in ONE atomic update, so they cannot drift:
 *   finalRound/*                        the standings, admin-readable only
 *   teams/{id}/finalSlot                the team's own room and time
 *   judges/{uid}/finalAssignments/{id}  what each judge has to see
 *
 * The last two exist because Realtime Database needs read permission at the
 * location being queried, and the standings must not be readable. Denormalising
 * is the same answer the first-round schedule already uses.
 */
export async function activateFinalRound({ limit = 4, requireSubmitted = true } = {}) {
  const user = await requireAdmin("activate the final round");

  const [teamsSnap, judgesSnap] = await Promise.all([
    get(ref(database, "teams")),
    get(ref(database, "judges")),
  ]);
  if (!teamsSnap.exists()) throw new Error("No teams found to evaluate for the final round");

  const teamsData = teamsSnap.val() ?? {};
  const judgesData = judgesSnap.exists() ? judgesSnap.val() ?? {} : {};
  const scoresByTeam = await loadFirstRoundScores(teamsData);

  const ranked = rankTeams(teamsData, scoresByTeam)
    // an unsubmitted team has nothing to present; it used to be eligible
    .filter((team) => (requireSubmitted ? team.submitted : true));

  if (!ranked.length) {
    throw new Error("No teams have scores yet. Final round cannot be activated.");
  }

  const finalists = ranked.slice(0, limit);
  const warnings = [];

  const underJudged = finalists.filter((t) => t.judgeCount < MIN_JUDGES_FOR_CONFIDENCE);
  if (underJudged.length) {
    warnings.push(
      `${underJudged.map((t) => t.name).join(", ")} reached the final on fewer than ` +
        `${MIN_JUDGES_FOR_CONFIDENCE} judges.`
    );
  }

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

  // Only judges who are actually working the round get assignments.
  //
  // This used to iterate every registered judge, so somebody who signed up in
  // October and never turned up still received finalAssignments -- and that
  // node is what the rules treat as proof of assignment for writing a final
  // score. A checked-in first-round judge is the right pool; if nobody is
  // checked in we fall back to first-round judges rather than assigning nobody.
  const workingJudges = Object.entries(judgesData)
    .filter(([, judge]) => judge?.isRound1Judge === true && judge?.checkedIn === true)
    .map(([uid]) => uid);
  const eligiblePool = workingJudges.length
    ? workingJudges
    : Object.entries(judgesData)
        .filter(([, judge]) => judge?.isRound1Judge === true)
        .map(([uid]) => uid);

  if (!eligiblePool.length) {
    warnings.push(
      "No judges are marked as first-round judges, so nobody has been given a final-round assignment."
    );
  }

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

  // A finalist every judge already saw in round one excludes all of them, and
  // ends up with nobody to present to. Reachable at small events -- with six
  // teams or fewer every judge sees every team -- and previously silent:
  // activation reported success while writing no assignments at all.
  const orphaned = Object.entries(teamsPayload)
    .filter(([teamId]) => !eligiblePool.some((uid) => !teamsPayload[teamId].excludedJudges[uid]))
    .map(([, details]) => details.name);
  if (orphaned.length) {
    warnings.push(
      `${orphaned.join(", ")} reached the final round with no eligible judge — every ` +
        `available judge already scored them in round one. Add a judge who did not, or ` +
        `clear an exclusion, or they present to an empty room.`
    );
  }

  const guard = await guardWith({
    label: `Before activating the final round (top ${finalists.length})`,
    reason: "activation rewrites every judge's final assignments and the standings",
    paths: ["teams", "judges", "finalRound"],
  });
  if (!guard.ok) throw new Error(guard.error);

  updates["finalRound/active"] = true;
  updates["finalRound/activatedAt"] = serverTimestamp();
  updates["finalRound/activatedBy"] = user.uid;
  updates["finalRound/teams"] = teamsPayload;

  await update(ref(database), updates);

  return { ok: true, finalists, warnings, ranked };
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
