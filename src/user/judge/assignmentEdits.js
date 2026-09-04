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
 * copies in ONE atomic multi-path update, the same way publishPlan does.
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

/**
 * What a team could be slotted into, for a team that has no schedule entry.
 *
 * A team that submits after the schedule was generated has nowhere to go: the
 * slot override edits an existing entry and returns nothing when there is none,
 * so the only remaining move was a full regenerate -- which rewrites every
 * assignment in the event and strands every score collected so far. That is the
 * same bad trade the rest of this file exists to avoid for a no-show judge.
 *
 * Returns, per batch, the time it presents and which configured rooms are still
 * free in it.
 */
export async function findOpenSlots() {
  const [teamsSnap, roomsSnap] = await Promise.all([
    get(ref(database, "teams")),
    get(ref(database, "config/judgingRooms")),
  ]);

  const rawRooms = roomsSnap.exists() ? roomsSnap.val() : [];
  const rooms = (Array.isArray(rawRooms) ? rawRooms : Object.values(rawRooms ?? {}))
    .filter((room) => typeof room === "string" && room.trim().length > 0);

  const byBatch = new Map();
  for (const team of Object.values(teamsSnap.val() ?? {})) {
    const schedule = team?.schedule;
    if (!schedule?.batch) continue;
    if (!byBatch.has(schedule.batch)) {
      byBatch.set(schedule.batch, { batch: schedule.batch, time: schedule.time, taken: new Set() });
    }
    byBatch.get(schedule.batch).taken.add(schedule.room);
  }

  return [...byBatch.values()]
    .sort((a, b) => a.batch - b.batch)
    .map(({ batch, time, taken }) => ({
      batch,
      time,
      freeRooms: rooms.filter((room) => !taken.has(room)),
    }));
}

/**
 * Give a team its own schedule entry without regenerating anything.
 *
 * Writes the team's entry and each chosen judge's copy in ONE update, the same
 * shape publishPlan produces, so nothing downstream can tell the
 * difference between a team scheduled here and one scheduled by a generation.
 */
export async function scheduleTeamIntoBatch({
  teamId,
  batch,
  room,
  time,
  judgeUids = [],
  allowConflict = false,
}) {
  await requireAdmin("schedule a team");

  if (!room || !batch) return { ok: false, error: "Pick a batch and a room." };
  if (!judgeUids.length) {
    return { ok: false, error: "Pick at least one judge, or the team presents to an empty room." };
  }

  const [teamSnap, teamsSnap, judgesSnap] = await Promise.all([
    get(ref(database, `teams/${teamId}`)),
    get(ref(database, "teams")),
    get(ref(database, "judges")),
  ]);

  if (!teamSnap.exists()) return { ok: false, error: "That team no longer exists." };
  const team = teamSnap.val();
  if (team.schedule) {
    return {
      ok: false,
      error: "That team is already scheduled. Use the slot override to move it instead.",
    };
  }

  // the room has to be free at that time, or two teams present to one room
  const clash = Object.entries(teamsSnap.val() ?? {}).find(
    ([id, other]) =>
      id !== teamId && other?.schedule?.batch === batch && other?.schedule?.room === room
  );
  if (clash) {
    return {
      ok: false,
      error: `${clash[1].name ?? "Another team"} is already in ${room} in batch ${batch}.`,
    };
  }

  const judges = judgesSnap.val() ?? {};
  const missing = judgeUids.filter((uid) => !judges[uid]);
  if (missing.length) return { ok: false, error: "One of those judges is not registered." };

  if (!allowConflict) {
    for (const uid of judgeUids) {
      const existing = assignmentList(judges[uid]?.teamAssignments).find(
        (assignment) => assignment.batch === batch && assignment.id !== teamId
      );
      if (existing) {
        return {
          ok: false,
          conflict: existing,
          error:
            `${displayName(judges[uid])} is already in ${existing.room} at ${existing.time} ` +
            `for ${existing.teamName} in batch ${batch}.`,
        };
      }
    }
  }

  const assignment = {
    teamName: team.name ?? "Unnamed Team",
    id: teamId,
    room,
    time: time ?? "TBD",
    batch,
    judges: judgeUids.map((uid) => ({ judgeId: uid, judgeName: displayName(judges[uid]) })),
  };

  const updates = { [`teams/${teamId}/schedule`]: assignment };
  for (const uid of judgeUids) {
    updates[`judges/${uid}/teamAssignments/${teamId}`] = assignment;
  }

  await update(ref(database), updates);
  return { ok: true, assignment };
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
