import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { applyAdminAction, captureBefore } from "./adminAction.js";

/**
 * Editing a record.
 *
 * Most fields are a one-path write. A team name is not: it is copied into
 * teams/{id}/schedule.teamName and into every assigned judge's own
 * teamAssignments, because the rules do not let a judge read the teams node.
 * Renaming without the fan-out leaves judges calling a team by a name nobody
 * else uses, which on the day means a judge looking for a team that is not on
 * anyone's list.
 */

/**
 * Allow-lists. Writing an arbitrary field object straight through would let a
 * mistyped key add junk to a record the rest of the app then has to tolerate.
 */
export const COMPETITOR_FIELDS = [
  "firstName", "lastName", "email", "dietaryRestriction", "checkedIn", "foodCheckIn",
];

export const JUDGE_FIELDS = [
  "firstName", "lastName", "email", "company", "withCompany", "wantsToMentor",
  "checkedIn", "foodCheckIn", "isRound1Judge",
];

/** Every path holding a copy of this team's name. Pure. */
export function renameTeamChanges({ teamId, from, to, teamData, judgesData }) {
  const changes = [{ path: `teams/${teamId}/name`, before: from, after: to }];

  if (teamData?.schedule) {
    changes.push({ path: `teams/${teamId}/schedule/teamName`, before: from, after: to });
  }

  for (const [judgeUid, judge] of Object.entries(judgesData ?? {})) {
    if (judge?.teamAssignments?.[teamId]) {
      changes.push({
        path: `judges/${judgeUid}/teamAssignments/${teamId}/teamName`,
        before: from,
        after: to,
      });
    }
  }

  return changes;
}

/**
 * Membership is a keyed set -- teams/{id}/members/{uid} = true -- because the
 * rules match on the child KEY. All three paths move together or the person is
 * on both teams, or on neither.
 */
export function moveMemberChanges({ uid, fromTeamId, toTeamId }) {
  const changes = [];
  if (fromTeamId) {
    changes.push({ path: `teams/${fromTeamId}/members/${uid}`, before: true, after: null });
  }
  if (toTeamId) {
    changes.push({ path: `teams/${toTeamId}/members/${uid}`, before: null, after: true });
  }
  changes.push({
    path: `competitors/${uid}/teamId`,
    before: fromTeamId ?? null,
    after: toTeamId ?? null,
  });
  return changes;
}

async function editRecord({ node, uid, fields, allowed, label, action }) {
  const wanted = Object.entries(fields ?? {}).filter(([key]) => allowed.includes(key));
  if (!wanted.length) return { ok: false, error: "Nothing to change." };

  const paths = wanted.map(([key]) => `${node}/${uid}/${key}`);
  const before = await captureBefore(paths);

  const changes = wanted
    .map(([key, value]) => ({
      path: `${node}/${uid}/${key}`,
      before: before[`${node}/${uid}/${key}`],
      after: value,
    }))
    // an unchanged field is noise in the feed, and undoing it would be a no-op
    .filter((change) => JSON.stringify(change.before ?? null) !== JSON.stringify(change.after ?? null));

  if (!changes.length) return { ok: false, error: "Nothing changed." };

  return applyAdminAction({
    action,
    summary: `${label}: ${changes.map((c) => c.path.split("/").pop()).join(", ")}`,
    changes,
  });
}

export function editCompetitor(uid, fields) {
  return editRecord({
    node: "competitors", uid, fields,
    allowed: COMPETITOR_FIELDS, label: `Edited competitor ${uid.slice(0, 8)}`,
    action: "competitor.edit",
  });
}

export function editJudge(uid, fields) {
  return editRecord({
    node: "judges", uid, fields,
    allowed: JUDGE_FIELDS, label: `Edited judge ${uid.slice(0, 8)}`,
    action: "judge.edit",
  });
}

export async function renameTeam(teamId, name) {
  const to = String(name ?? "").trim();
  if (!to) return { ok: false, error: "Give the team a name." };

  const [teamSnap, judgesSnap] = await Promise.all([
    get(ref(database, `teams/${teamId}`)),
    get(ref(database, "judges")),
  ]);
  if (!teamSnap.exists()) return { ok: false, error: "That team no longer exists." };

  const teamData = teamSnap.val();
  const from = teamData?.name ?? null;
  if (from === to) return { ok: false, error: "That is already the name." };

  const changes = renameTeamChanges({
    teamId, from, to, teamData,
    judgesData: judgesSnap.exists() ? judgesSnap.val() : {},
  });

  return applyAdminAction({
    action: "team.rename",
    summary: `Renamed ${from ?? "an unnamed team"} to ${to}` +
      (changes.length > 1 ? ` (${changes.length - 1} denormalised copies)` : ""),
    changes,
  });
}

export async function moveCompetitorToTeam({ uid, name, toTeamId }) {
  const snap = await get(ref(database, `competitors/${uid}/teamId`));
  const fromTeamId = snap.exists() ? snap.val() : null;

  if (fromTeamId === (toTeamId ?? null)) {
    return { ok: false, error: "They are already on that team." };
  }

  // warn, do not block: an empty team is recoverable, and blocking here would
  // make the last member impossible to move
  let emptiedTeam = null;
  if (fromTeamId) {
    const membersSnap = await get(ref(database, `teams/${fromTeamId}/members`));
    const remaining = Object.keys(membersSnap.exists() ? membersSnap.val() ?? {} : {})
      .filter((memberUid) => memberUid !== uid);
    if (!remaining.length) emptiedTeam = fromTeamId;
  }

  const result = await applyAdminAction({
    action: "competitor.move",
    summary: `Moved ${name || uid.slice(0, 8)} ${fromTeamId ? `from ${fromTeamId} ` : ""}` +
      `to ${toTeamId ?? "no team"}`,
    changes: moveMemberChanges({ uid, fromTeamId, toTeamId }),
  });

  return { ...result, emptiedTeam };
}
