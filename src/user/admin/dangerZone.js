import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { applyAdminAction, captureBefore } from "./adminAction.js";
import { FIRST_ROUND, FINAL_ROUND } from "../judge/getTeamInfo.js";

/**
 * Break-glass tooling: the things you reach for when something has already
 * gone wrong.
 *
 * deleteScore is the one that needs explaining. A card cannot be put back:
 * enteredBy is pinned to auth.uid by the rules, and that pin is where the
 * "a judge cannot file under another judge" guarantee lives. Restoring one as a
 * different admin would fail validation, and weakening the rule to allow it
 * would cost more than the undo is worth. So the delete is marked not-undoable
 * and the card is handed back, for the caller to re-enter through the paper
 * score dialog -- which stamps the correct new provenance.
 */

/** Every path holding this team's room and time. Pure. */
export function overrideSlotChanges({ teamId, room, time, teamData, judgesData }) {
  const schedule = teamData?.schedule;
  if (!schedule) return [];

  const fields = [];
  if (room && room !== schedule.room) fields.push(["room", schedule.room, room]);
  if (time && time !== schedule.time) fields.push(["time", schedule.time, time]);
  if (!fields.length) return [];

  const changes = fields.map(([field, before, after]) => ({
    path: `teams/${teamId}/schedule/${field}`,
    before,
    after,
  }));

  for (const [judgeUid, judge] of Object.entries(judgesData ?? {})) {
    if (!judge?.teamAssignments?.[teamId]) continue;
    for (const [field, before, after] of fields) {
      changes.push({
        path: `judges/${judgeUid}/teamAssignments/${teamId}/${field}`,
        before,
        after,
      });
    }
  }

  return changes;
}

export async function overrideTeamSlot({ teamId, teamName, room, time }) {
  const [teamSnap, judgesSnap] = await Promise.all([
    get(ref(database, `teams/${teamId}`)),
    get(ref(database, "judges")),
  ]);
  if (!teamSnap.exists()) return { ok: false, error: "That team no longer exists." };

  const changes = overrideSlotChanges({
    teamId, room, time,
    teamData: teamSnap.val(),
    judgesData: judgesSnap.exists() ? judgesSnap.val() : {},
  });

  if (!changes.length) {
    return { ok: false, error: "Nothing changed. Generate a schedule first if there is none." };
  }

  return applyAdminAction({
    action: "team.slot",
    summary: `Moved ${teamName || teamId} to ${room} at ${time}`,
    changes,
  });
}

export async function deleteScore({ round, teamId, judgeUid, teamName, judgeName }) {
  if (round !== FIRST_ROUND && round !== FINAL_ROUND) {
    return { ok: false, error: `Unknown round "${round}".` };
  }

  const path = `scores/${round}/${teamId}/${judgeUid}`;
  const snap = await get(ref(database, path));
  if (!snap.exists()) return { ok: false, error: "That score is no longer there." };

  const card = snap.val();

  const result = await applyAdminAction({
    action: "score.delete",
    summary: `Deleted the ${round} round card for ${teamName || teamId} from ${judgeName || judgeUid}`,
    changes: [{ path, before: card, after: null }],
    // enteredBy is pinned to auth.uid, so nobody but the original author could
    // write this card back. Re-entry goes through PaperScoreDialog instead.
    undoable: false,
  });

  return { ...result, card };
}

export async function setTeamSubmitted({ teamId, teamName, submitted }) {
  const before = await captureBefore([`teams/${teamId}/submitted`]);
  const was = before[`teams/${teamId}/submitted`] ?? false;

  if (Boolean(was) === Boolean(submitted)) {
    return { ok: false, error: `That team is already ${submitted ? "submitted" : "not submitted"}.` };
  }

  return applyAdminAction({
    action: "team.submitted",
    summary: `${submitted ? "Marked" : "Un-marked"} ${teamName || teamId} as submitted`,
    changes: [{ path: `teams/${teamId}/submitted`, before: was, after: Boolean(submitted) }],
  });
}

/**
 * Wipe every assignment, and optionally every score with them.
 *
 * By default scores are left alone. They are keyed by team and judge, so they
 * survive a regeneration and re-attach if the same pairing comes back -- the
 * same reason getJudgeSchedule warns about stranding rather than deleting.
 * Losing them because you wanted to redo the rooms would be a bad trade.
 *
 * `includeScores` is the deliberate, louder choice: a real start from scratch.
 * It has to clear two places, not one. READ_LEGACY_SCORE_PATH is still true, so
 * pre-migration cards live at teams/{id}/scores and teams/{id}/finalScores as
 * well as under /scores, and both are still read -- by the Teams dashboard and
 * by the averages the final round is picked from. Clearing only /scores would
 * leave those behind, which is precisely not starting from scratch.
 *
 * Admins already hold the permission for this: the root rule reaches /scores,
 * and a delete skips .validate, so the card shape never gets to reject a null.
 * test/rules/scores.test.mjs pins both.
 */
export async function clearSchedule({ includeScores = false } = {}) {
  const [teamsSnap, judgesSnap] = await Promise.all([
    get(ref(database, "teams")),
    get(ref(database, "judges")),
  ]);

  const teamsData = teamsSnap.exists() ? teamsSnap.val() ?? {} : {};
  const judgesData = judgesSnap.exists() ? judgesSnap.val() ?? {} : {};

  const changes = [];
  for (const [teamId, team] of Object.entries(teamsData)) {
    if (team?.schedule) {
      changes.push({ path: `teams/${teamId}/schedule`, before: team.schedule, after: null });
    }
  }
  for (const [judgeUid, judge] of Object.entries(judgesData)) {
    if (judge?.teamAssignments) {
      changes.push({
        path: `judges/${judgeUid}/teamAssignments`,
        before: judge.teamAssignments,
        after: null,
      });
    }
  }

  const assignmentCount = changes.length;

  let scoreCount = 0;
  if (includeScores) {
    const scoresSnap = await get(ref(database, "scores"));
    if (scoresSnap.exists()) {
      changes.push({ path: "scores", before: scoresSnap.val(), after: null });
      scoreCount += 1;
    }

    // the pre-migration copies, which are still read
    for (const [teamId, team] of Object.entries(teamsData)) {
      for (const field of ["scores", "finalScores"]) {
        if (team?.[field]) {
          changes.push({ path: `teams/${teamId}/${field}`, before: team[field], after: null });
          scoreCount += 1;
        }
      }
    }
  }

  if (!changes.length) {
    return {
      ok: false,
      error: includeScores
        ? "There is no schedule and no scores to clear."
        : "There is no schedule to clear.",
    };
  }

  // Only worth clearing when there was a schedule; on a scores-only reset there
  // is no generation metadata to remove.
  if (assignmentCount) {
    const meta = await captureBefore(["config/scheduleMeta"]);
    changes.push({
      path: "config/scheduleMeta",
      before: meta["config/scheduleMeta"],
      after: null,
    });
  }

  const summary = includeScores
    ? `Cleared the schedule and every score: ${assignmentCount} assignment records, ${scoreCount} score locations`
    : `Cleared the schedule: ${assignmentCount} assignment records`;

  return applyAdminAction({ action: "schedule.clear", summary, changes });
}

/**
 * Put one team into the final round by hand.
 *
 * Mirrors what activateFinalRound writes for a whole cohort: the private
 * standings entry, the team's own slot, and a copy for each final-round judge.
 * teams/{id}/finalSlot validates $other:false, so it carries room and timeslot
 * and nothing else.
 */
export async function forceIntoFinalRound({ teamId, teamName, room, timeslot, judgeUids = [] }) {
  if (!room || !timeslot) return { ok: false, error: "Give the team a room and a timeslot." };

  const paths = [
    `finalRound/teams/${teamId}`,
    `teams/${teamId}/finalSlot`,
    ...judgeUids.map((uid) => `judges/${uid}/finalAssignments/${teamId}`),
  ];
  const before = await captureBefore(paths);

  const changes = [
    {
      path: `finalRound/teams/${teamId}`,
      before: before[`finalRound/teams/${teamId}`],
      after: { teamId, name: teamName ?? "Unnamed team", addedByHand: true },
    },
    {
      path: `teams/${teamId}/finalSlot`,
      before: before[`teams/${teamId}/finalSlot`],
      after: { room, timeslot },
    },
    ...judgeUids.map((uid) => ({
      path: `judges/${uid}/finalAssignments/${teamId}`,
      before: before[`judges/${uid}/finalAssignments/${teamId}`],
      after: { teamId, teamName: teamName ?? "Unnamed team", room, timeslot },
    })),
  ];

  return applyAdminAction({
    action: "finalRound.force",
    summary: `Put ${teamName || teamId} into the final round in ${room} at ${timeslot}`,
    changes,
  });
}
