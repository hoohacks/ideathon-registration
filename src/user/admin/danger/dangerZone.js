import { ref, get } from "firebase/database";
import { database } from "../../../firebase.js";
import { applyAdminAction, captureBefore } from "../adminAction.js";
import { guardWith } from "../snapshots.js";
import { FIRST_ROUND, FINAL_ROUND } from "../../judge/getTeamInfo.js";
import { assignmentList } from "../../judge/assignmentList.js";
import { parseClockTime, sameClockTime } from "../../judge/clockTime.js";
import { personName } from "../../../roles.js";

/**
 * Break-glass tooling: the things you reach for when something has already
 * gone wrong.
 *
 * Everything destructive here takes a restore point first and refuses if one
 * cannot be written. That matters because the audit log cannot carry a bulk
 * before-state: past UNDO_SIZE_CAP it keeps counts only, so recoverability used
 * to depend on how big the event was.
 *
 * deleteScore returns the card as well as deleting it. The delete is undoable
 * from the activity feed; the returned values are for the other case, where the
 * card was wrong rather than the deletion, and a corrected one is re-entered
 * through the paper score dialog.
 */

/**
 * Which batch presents at which time, for a schedule that already exists.
 *
 * Read off the teams' own schedule entries, the same source findOpenSlots uses
 * for "slot an unscheduled team into an existing batch" (assignmentEdits.js),
 * and for the same reason: once a schedule is generated, the entries ARE the
 * schedule. config/batchTimes is only the input to generation and can drift
 * from what was published (an organizer edits it afterwards, or an earlier
 * override relabelled a team), so trusting it here could send a team into a
 * batch whose label no other team in that batch shows. Like findOpenSlots, the
 * first team seen in a batch supplies its time. Pure.
 */
export function batchTimesOf(teamsData) {
  const byBatch = new Map();
  for (const team of Object.values(teamsData ?? {})) {
    const schedule = team?.schedule;
    if (!schedule?.batch || byBatch.has(schedule.batch)) continue;
    byBatch.set(schedule.batch, { batch: schedule.batch, time: schedule.time });
  }
  return [...byBatch.values()].sort((a, b) => a.batch - b.batch);
}

/**
 * The batch a typed time belongs to, or null if it is not a batch's time.
 *
 * Deliberately the only place that decides whether two time strings are "the
 * same time", so the comparison lives in one edit. It compares clock times, not
 * text, so "5pm" finds the "5:00 PM" batch. TeamEditDrawer calls it too, so its
 * hint and the save can never disagree.
 */
export function batchForTime(time, batchTimes) {
  if (parseClockTime(time) == null) return null;
  return (batchTimes ?? []).find((slot) => sameClockTime(time, slot.time))?.batch ?? null;
}

/** Every path holding this team's room, time and batch. Pure. */
export function overrideSlotChanges({ teamId, room, time, batch, teamData, judgesData }) {
  const schedule = teamData?.schedule;
  if (!schedule) return [];

  const fields = [];
  if (room && room !== schedule.room) fields.push(["room", schedule.room, room]);
  if (time && time !== schedule.time) fields.push(["time", schedule.time, time]);
  // the batch follows the time: a judge's copy carries it too, and findConflict
  // reads it to decide whether a judge is double-booked
  if (batch != null && batch !== schedule.batch) fields.push(["batch", schedule.batch, batch]);
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
  const [teamSnap, teamsSnap, judgesSnap] = await Promise.all([
    get(ref(database, `teams/${teamId}`)),
    get(ref(database, "teams")),
    get(ref(database, "judges")),
  ]);
  if (!teamSnap.exists()) return { ok: false, error: "That team no longer exists." };

  const teamData = teamSnap.val();
  const current = teamData?.schedule;
  let typedTime = typeof time === "string" ? time.trim() : time;

  /*
   * The time decides the batch.
   *
   * A batch is a time: every team in it presents then. So typing another
   * batch's time IS a move to that batch, and the batch has to be written with
   * it. This used to change only the room and the label and leave the batch
   * alone, which broke two things: the clash check below compared against the
   * OLD batch (so a team could be dropped into an occupied room in another
   * batch, and a refusal named whoever sat in that room in the old one), and
   * the record kept claiming the old batch for judges' double-booking checks.
   *
   * Text that is not a clock time at all ("25:99 XM") is refused first, with
   * its own message: it used to be saved and copied onto every assigned judge's
   * card. A real time that is not a batch's time cannot be placed anywhere, so
   * it is refused with the times that would work.
   *
   * Leaving the time as it already is never needs a lookup, so a room-only edit
   * still works on a schedule whose label is odd. "As it already is" is judged
   * by clock time, so retyping "5:00pm" over "5:00 PM" is not a move.
   */
  let targetBatch = current?.batch;
  const unchangedTime =
    !typedTime || typedTime === current?.time || sameClockTime(typedTime, current?.time);
  if (current && !unchangedTime) {
    if (parseClockTime(typedTime) == null) {
      return { ok: false, error: `"${typedTime}" is not a clock time like 5:00 PM.` };
    }
    const batchTimes = batchTimesOf(teamsSnap.val());
    const found = batchForTime(typedTime, batchTimes);
    if (found == null) {
      const valid = batchTimes.map((slot) => `${slot.time} (batch ${slot.batch})`).join(", ");
      return {
        ok: false,
        error: valid
          ? `${typedTime} is not a batch time. Valid times: ${valid}.`
          : `${typedTime} is not a batch time, and no batches are scheduled.`,
      };
    }
    targetBatch = found;
    // write the batch's own label, not the admin's spelling, so every card for
    // the batch reads the same ("5pm" is stored as "5:00 PM")
    typedTime = batchTimes.find((slot) => slot.batch === found).time;
  } else if (current && typedTime) {
    // same time in another spelling: keep what is stored so nothing is rewritten
    typedTime = current.time;
  }
  const batchChanged = targetBatch != null && targetBatch !== current?.batch;

  /*
   * Two teams cannot present in one room at one time.
   *
   * Both other ways into a slot refuse it: the planner's moveTeam, and
   * scheduleTeamIntoBatch. This is the one an organizer uses during the event,
   * off a team's record, which makes it the worst of the three to leave open.
   *
   * It checks the slot the team is moving INTO -- the new batch and the new
   * room -- so it runs when either one changes, including a move that only
   * changes the time. It does not run when neither does: re-saving a team in
   * the slot it already holds should not be blocked by a clash somewhere else
   * on an event that already has one.
   */
  const targetRoom = room || current?.room;
  if (targetBatch && targetRoom && (batchChanged || targetRoom !== current?.room)) {
    const clash = Object.entries(teamsSnap.val() ?? {}).find(
      ([id, other]) =>
        id !== teamId && other?.schedule?.batch === targetBatch && other?.schedule?.room === targetRoom
    );
    if (clash) {
      return {
        ok: false,
        error: `${clash[1]?.name ?? "Another team"} is already in ${targetRoom} in batch ${targetBatch}.`,
      };
    }
  }

  /*
   * Judges travel with the team, so a batch move can double-book one of them.
   *
   * Same rule as findConflict (assignmentEdits.js): a judge already on another
   * team in the batch is refused. findConflict reads one judge at a time, and
   * the judges snapshot is already in hand, so this applies the same test to it
   * instead of one more read per judge.
   */
  const judgesData = judgesSnap.exists() ? judgesSnap.val() : {};
  if (batchChanged) {
    for (const [judgeUid, judge] of Object.entries(judgesData ?? {})) {
      if (!judge?.teamAssignments?.[teamId]) continue;
      const other = assignmentList(judge.teamAssignments).find(
        (existing) => existing.batch === targetBatch && existing.id !== teamId
      );
      if (other) {
        return {
          ok: false,
          error:
            `${personName(judge, "A judge")} is already judging ${other.teamName ?? "another team"} ` +
            `in batch ${targetBatch}.`,
        };
      }
    }
  }

  const changes = overrideSlotChanges({
    teamId, room, time: typedTime,
    batch: batchChanged ? targetBatch : undefined,
    teamData,
    judgesData,
  });

  if (!changes.length) {
    return { ok: false, error: "Nothing changed. Generate a schedule first if there is none." };
  }

  return applyAdminAction({
    action: "team.slot",
    summary:
      `Moved ${teamName || teamId} to ${targetRoom} at ${typedTime || current?.time}` +
      (batchChanged ? ` (batch ${targetBatch})` : ""),
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
    // Undoable now. enteredBy used to be pinned to auth.uid for everyone, so
    // nobody but the original author could write a card back and this had to be
    // undoable:false, with re-entry through PaperScoreDialog stamping new
    // provenance. The pin now exempts admins, so an undo restores the card
    // exactly as the judge filed it. The dialog is still offered, because
    // re-entering from paper is a different thing from undoing a mistake.
    undoable: true,
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
 * same reason republishing a schedule warns about stranding rather than deleting.
 * Losing them because you wanted to redo the rooms would be a bad trade.
 *
 * `includeScores` is the deliberate, louder choice: a real start from scratch.
 * It clears the pre-migration locations too -- teams/{id}/scores and
 * teams/{id}/finalScores -- even though nothing reads them any more. A project
 * old enough to hold them would otherwise keep them through a wipe, and "start
 * from scratch" has to mean it. Each is only touched if it is actually there.
 *
 * Admins already hold the permission for this: the root rule reaches /scores,
 * and a delete skips .validate, so the card shape never gets to reject a null.
 * test/rules/scores.test.mjs pins both.
 */
/**
 * Read teams/judges (and, if asked, scores) once, and turn that into the
 * `changes` clearSchedule would apply. Pure given the snapshots -- the actual
 * reads live in `readClearScheduleData` below, so this can be re-run against
 * two different reads without hitting the database twice for the same call.
 */
function buildClearChanges({ teamsData, judgesData, scoresData, includeScores }) {
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
    if (scoresData) {
      changes.push({ path: "scores", before: scoresData, after: null });
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

  return { changes, assignmentCount, scoreCount };
}

async function readClearScheduleData(includeScores) {
  const [teamsSnap, judgesSnap, scoresSnap] = await Promise.all([
    get(ref(database, "teams")),
    get(ref(database, "judges")),
    includeScores ? get(ref(database, "scores")) : Promise.resolve(null),
  ]);
  return {
    teamsData: teamsSnap.exists() ? teamsSnap.val() ?? {} : {},
    judgesData: judgesSnap.exists() ? judgesSnap.val() ?? {} : {},
    scoresData: scoresSnap && scoresSnap.exists() ? scoresSnap.val() : null,
  };
}

function summarize({ includeScores, assignmentCount, scoreCount }) {
  return includeScores
    ? `Cleared the schedule and every score: ${assignmentCount} assignment records, ${scoreCount} score locations`
    : `Cleared the schedule: ${assignmentCount} assignment records`;
}

export async function clearSchedule({ includeScores = false } = {}) {
  const initial = await readClearScheduleData(includeScores);
  const first = buildClearChanges({ ...initial, includeScores });

  if (!first.changes.length) {
    return {
      ok: false,
      error: includeScores
        ? "There is no schedule and no scores to clear."
        : "There is no schedule to clear.",
    };
  }

  const summary = summarize({ includeScores, ...first });

  // A restore point BEFORE the wipe, and a refusal if it cannot be taken.
  //
  // The audit log alone was not enough here and the reason is worth stating:
  // applyAdminAction inlines the before-state, and drops it past
  // UNDO_SIZE_CAP. The payload for this action crosses that cap somewhere
  // around 25 teams, so clearing every score was undoable on a small test
  // event and permanent on a real one -- the safety net was present exactly
  // where it was not needed and absent where it was.
  const guard = await guardWith({
    label: summary,
    reason: includeScores
      ? "clearing every score cannot be undone from the activity feed"
      : "clearing the schedule replaces every assignment in the event",
    paths: includeScores
      ? ["teams", "judges", "scores", "config/scheduleMeta"]
      : ["teams", "judges", "config/scheduleMeta"],
  });
  if (!guard.ok) return { ok: false, error: guard.error };

  /*
   * Re-read teams/judges (and scores) here, as late as this function can put
   * a read -- immediately before the write, rather than reusing the read
   * from the top of this function.
   *
   * guardWith's own captureSnapshot sits between that early read and this
   * line: a fresh read of its own of these same paths, an index read, and an
   * index write, each an await point where another organizer's edit can
   * land. Using the early read's values here would mean the log could record
   * a `before` that was no longer true by the time this action actually
   * wrote anything -- the restore point would correctly hold the other
   * organizer's edit (it re-reads live data), but adminLog would say
   * something different, and undoAdminAction's findDrift only ever checks a
   * change's `after`, never whether its `before` was accurate. A later Undo
   * would then silently restore the stale value and clobber the other
   * organizer's edit with no drift check to catch it.
   *
   * This NARROWS the window, it does not CLOSE it: `changes[].before` below
   * is still a read that happens strictly before the write, not a value the
   * write is conditioned on. RTDB's multi-path update() is atomic across
   * paths but not conditional on any of them -- there is no primitive here
   * to make this a true compare-and-swap the way a single-path
   * runTransaction can. A complete fix would need every path this touches to
   * be written through its own conditional transaction, which multi-location
   * update() cannot express and which is a larger change than this file.
   */
  const fresh = await readClearScheduleData(includeScores);
  const rebuilt = buildClearChanges({ ...fresh, includeScores });

  if (!rebuilt.changes.length) {
    return {
      ok: false,
      error:
        "There was nothing left to clear by the time the restore point finished saving. " +
        "Nothing was changed.",
    };
  }

  let changes = rebuilt.changes;

  // Only worth clearing when there was a schedule; on a scores-only reset there
  // is no generation metadata to remove.
  if (rebuilt.assignmentCount) {
    const meta = await captureBefore(["config/scheduleMeta"]);
    changes = [
      ...changes,
      { path: "config/scheduleMeta", before: meta["config/scheduleMeta"], after: null },
    ];
  }

  const result = await applyAdminAction({
    action: "schedule.clear",
    summary: summarize({ includeScores, ...rebuilt }),
    changes,
    hasRestorePoint: true,
  });
  return { ...result, snapshotId: guard.snapshotId };
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

  const teamsSnap = await get(ref(database, "teams"));
  const teamsData = teamsSnap.exists() ? teamsSnap.val() : {};

  /*
   * Two finalists cannot present in one room at one time.
   *
   * This writes finalSlot straight from TeamEditDrawer's free-text room and
   * timeslot fields with no check against any other finalist's seat -- the
   * same gap overrideTeamSlot had for the first round before 27182ff. Same
   * shape here: room and timeslot together are the seat, so a collision is
   * another team holding both at once.
   *
   * Only when the seat actually changes. A finalist re-saved with the slot it
   * already has -- to add a judge, say -- should not be blocked by a clash
   * that was already there before this call.
   */
  const existingSlot = teamsData?.[teamId]?.finalSlot;
  if (room !== existingSlot?.room || timeslot !== existingSlot?.timeslot) {
    const clash = Object.entries(teamsData ?? {}).find(
      ([id, other]) =>
        id !== teamId && other?.finalSlot?.room === room && other?.finalSlot?.timeslot === timeslot
    );
    if (clash) {
      return {
        ok: false,
        error: `${clash[1]?.name ?? "Another team"} is already in ${room} at ${timeslot}.`,
      };
    }
  }

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
