import { ref, get, update } from "firebase/database";
import { database } from "../../firebase.js";
import { requireAdmin } from "../../roles.js";
import { assignmentList } from "./assignmentList.js";

/**
 * Moving one judge, without regenerating the schedule.
 *
 * Regeneration is all or nothing: it rewrites every assignment in the event and
 * strands any score already collected, because scores are keyed by team and
 * judge and moving an assignment does not move them. That made the only
 * available response to a no-show — the single most likely thing to go wrong on
 * the day — worse than the problem.
 *
 * An assignment is stored twice on purpose, at `teams/{id}/schedule` and at
 * `judges/{uid}/teamAssignments/{id}`, so that a judge can read their own list
 * without read access to every team. Every function here therefore writes both
 * copies in ONE atomic multi-path update, the same way getJudgeSchedule does.
 * They cannot half-apply.
 *
 * The wrinkle is that each judge's copy carries the whole `judges` roster for
 * that team, so adding or removing one judge means rewriting the copy held by
 * every other judge on that team too. That fan-out is what these helpers exist
 * to get right.
 */

function displayName(person, fallback = "Unnamed Judge") {
  const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}

async function loadContext(teamId, judgeUid) {
  const [scheduleSnap, judgesSnap] = await Promise.all([
    get(ref(database, `teams/${teamId}/schedule`)),
    get(ref(database, "judges")),
  ]);

  if (!scheduleSnap.exists()) {
    throw new Error("That team has no schedule entry. Generate the schedule first.");
  }

  const judges = judgesSnap.val() ?? {};
  if (judgeUid && !judges[judgeUid]) {
    throw new Error("That judge is not registered.");
  }

  return { schedule: scheduleSnap.val(), judges };
}

/**
 * Write one assignment out to the team and to every judge on it.
 * `roster` is the full, final list of { judgeId, judgeName } for the team.
 */
function fanOut(updates, teamId, schedule, roster, previousRoster) {
  const assignment = { ...schedule, judges: roster };

  updates[`teams/${teamId}/schedule/judges`] = roster;

  for (const judge of roster) {
    updates[`judges/${judge.judgeId}/teamAssignments/${teamId}`] = assignment;
  }

  // anyone dropped from the roster loses their copy
  for (const judge of previousRoster) {
    if (!roster.some((kept) => kept.judgeId === judge.judgeId)) {
      updates[`judges/${judge.judgeId}/teamAssignments/${teamId}`] = null;
    }
  }
}

function rosterOf(schedule) {
  const raw = schedule?.judges;
  const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  return list.filter((entry) => entry && entry.judgeId);
}

/**
 * Is this judge already booked elsewhere at the same time?
 *
 * A judge sent to two rooms in one batch simply does not turn up to one of
 * them, and nothing would have reported it.
 */
export async function findConflict(judgeUid, teamId, batch) {
  const snap = await get(ref(database, `judges/${judgeUid}/teamAssignments`));
  if (!snap.exists()) return null;

  return (
    assignmentList(snap.val()).find(
      (existing) => existing.batch === batch && existing.id !== teamId
    ) ?? null
  );
}

export async function assignJudgeToTeam({ judgeUid, teamId, allowConflict = false }) {
  await requireAdmin("change judging assignments");
  const { schedule, judges } = await loadContext(teamId, judgeUid);

  const previous = rosterOf(schedule);
  if (previous.some((entry) => entry.judgeId === judgeUid)) {
    return { ok: true, unchanged: true, roster: previous };
  }

  if (!allowConflict) {
    const clash = await findConflict(judgeUid, teamId, schedule.batch);
    if (clash) {
      return {
        ok: false,
        conflict: clash,
        error: `That judge is already in ${clash.room} at ${clash.time} for ${clash.teamName}.`,
      };
    }
  }

  const roster = [
    ...previous,
    { judgeId: judgeUid, judgeName: displayName(judges[judgeUid]) },
  ];

  const updates = {};
  fanOut(updates, teamId, schedule, roster, previous);
  await update(ref(database), updates);

  return { ok: true, roster };
}

export async function unassignJudgeFromTeam({ judgeUid, teamId }) {
  await requireAdmin("change judging assignments");
  const { schedule } = await loadContext(teamId, null);

  const previous = rosterOf(schedule);
  const roster = previous.filter((entry) => entry.judgeId !== judgeUid);

  if (roster.length === previous.length) {
    return { ok: true, unchanged: true, roster };
  }
  if (!roster.length) {
    return {
      ok: false,
      error:
        "That is the only judge assigned to this team. Assign a replacement first, " +
        "or the team presents to an empty room.",
    };
  }

  const updates = {};
  fanOut(updates, teamId, schedule, roster, previous);
  await update(ref(database), updates);

  return { ok: true, roster };
}

/** Replace one judge with another on the same team, in a single update. */
export async function swapJudges({ teamId, fromJudgeUid, toJudgeUid, allowConflict = false }) {
  await requireAdmin("change judging assignments");
  const { schedule, judges } = await loadContext(teamId, toJudgeUid);

  const previous = rosterOf(schedule);
  if (!previous.some((entry) => entry.judgeId === fromJudgeUid)) {
    return { ok: false, error: "That judge is not assigned to this team." };
  }
  if (previous.some((entry) => entry.judgeId === toJudgeUid)) {
    return { ok: false, error: "The replacement is already assigned to this team." };
  }

  if (!allowConflict) {
    const clash = await findConflict(toJudgeUid, teamId, schedule.batch);
    if (clash) {
      return {
        ok: false,
        conflict: clash,
        error: `The replacement is already in ${clash.room} at ${clash.time} for ${clash.teamName}.`,
      };
    }
  }

  const roster = previous
    .filter((entry) => entry.judgeId !== fromJudgeUid)
    .concat({ judgeId: toJudgeUid, judgeName: displayName(judges[toJudgeUid]) });

  const updates = {};
  fanOut(updates, teamId, schedule, roster, previous);
  await update(ref(database), updates);

  return { ok: true, roster };
}
