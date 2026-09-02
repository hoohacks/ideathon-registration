import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { fetchRooms, fetchBatchConfig, displayName } from "./scheduleConfig.js";

/**
 * What moved since a plan was built.
 *
 * A plan is a snapshot: `planSchedule` reads the world once and hands back a
 * draft an organizer can hand-edit before anything is published. Time passes
 * between that read and the publish -- a team submits, a judge goes home, a
 * room floods -- and publishing on the old snapshot would write a schedule
 * that is quietly wrong: a team with no slot, a judge on a card who is no
 * longer eligible.
 *
 * `checkDrift` is the comparison. It never touches the database -- it takes
 * the fingerprint the plan was built from (`basis`), the same shape read
 * fresh (`live`), and the plan itself, and sorts what changed into two piles:
 *
 *   blocking  -- the plan is now wrong, not merely stale. Each item carries a
 *                `repair`, a targeted fix an organizer can apply instead of
 *                rebuilding and losing their hand edits.
 *   advisory  -- shown, but the plan still publishes fine as it stands.
 *
 * `readLiveBasis` is the only half of this file that reads the database. It
 * has to shape teams and judges exactly as `planSchedule` does -- same
 * `submitted` filter, same `isRound1Judge` and `checkedIn` filters, the same
 * `displayName` -- or drift would fire on a difference that was never real,
 * just two places naming things differently.
 */

/**
 * The first open room in the emptiest batch, for placing a team that showed
 * up after the plan was built. `null` means the event is full: every batch,
 * in every configured room, is already spoken for.
 */
function freeSlot(plan, live) {
  for (let batch = 1; batch <= live.batchCount; batch++) {
    const taken = new Set(
      Object.values(plan.assignments).filter((a) => a.batch === batch).map((a) => a.room)
    );
    const room = live.rooms.find((r) => !taken.has(r));
    if (room) return { batch, room };
  }
  return null;
}

/**
 * Compares the fingerprint a plan was built from (`basis`) against the same
 * shape read fresh (`live`), and classifies what moved. Pure -- no database,
 * no clock, nothing but the three arguments -- so it can be tested with plain
 * fixtures and used again unchanged wherever a plan needs re-checking.
 */
export function checkDrift(basis, live, plan) {
  const blocking = [];
  const advisory = [];

  const basisTeamIds = new Set(basis.teamIds);
  const liveTeamIds = new Set(live.teamIds);
  const liveJudgeIds = new Set(live.judgeIds);

  // ---- teams that submitted since the plan was built ----
  const appeared = live.teamIds.filter((id) => !basisTeamIds.has(id)).sort();
  for (const teamId of appeared) {
    const teamName = live.teamNames?.[teamId] ?? teamId;
    const slot = freeSlot(plan, live);
    if (slot) {
      blocking.push({
        kind: "teamAppeared",
        message: `${teamName} submitted after this plan was built and has no slot.`,
        repair: { type: "moveTeam", teamId, batch: slot.batch, room: slot.room },
      });
    } else {
      blocking.push({
        kind: "teamAppeared",
        message: `${teamName} submitted after this plan was built, but every room in every ` +
          "batch is already taken. Rebuild the plan to include them.",
        repair: { type: "rebuild" },
      });
    }
  }

  // ---- teams that withdrew their submission ----
  const withdrew = basis.teamIds.filter((id) => !liveTeamIds.has(id)).sort();
  for (const teamId of withdrew) {
    const teamName = plan.teamNames?.[teamId] ?? teamId;
    blocking.push({
      kind: "teamWithdrew",
      message: `${teamName} withdrew its submission since this plan was built.`,
      repair: { type: "dropTeam", teamId },
    });
  }

  // ---- judges who lost eligibility ----
  // A judge on a panel makes the plan wrong -- that card now points at
  // someone who will not show. A judge who was only a spare makes no card
  // wrong at all, so it is advisory.
  const lostJudges = basis.judgeIds.filter((id) => !liveJudgeIds.has(id));
  for (const judgeId of lostJudges) {
    const judgeName = plan.judgeNames?.[judgeId] ?? live.judgeNames?.[judgeId] ?? judgeId;
    const onPanels = Object.values(plan.assignments).filter((a) =>
      a.judges.some((j) => j.judgeId === judgeId)
    );

    if (onPanels.length > 0) {
      for (const assignment of onPanels) {
        blocking.push({
          kind: "judgeLost",
          message: `${judgeName} is no longer a first round judge, but is on the panel ` +
            `for ${assignment.teamName}.`,
          repair: { type: "removeJudge", teamId: assignment.id, judgeUid: judgeId },
        });
      }
    } else {
      advisory.push({
        kind: "judgeLost",
        message: `${judgeName} is no longer available, but was only a spare judge and is ` +
          "not on any panel.",
      });
    }
  }

  // ---- rooms the plan actually uses that are no longer configured ----
  const liveRoomsSet = new Set(live.rooms);
  const usedRooms = [...new Set(Object.values(plan.assignments).map((a) => a.room))].sort();
  for (const room of usedRooms) {
    if (!liveRoomsSet.has(room)) {
      blocking.push({
        kind: "roomRemoved",
        message: `${room} is no longer a configured room, but this plan uses it.`,
        repair: { type: "rebuild" },
      });
    }
  }

  // ---- the shape of the day changed ----
  if (basis.batchCount !== live.batchCount) {
    blocking.push({
      kind: "batchCountChanged",
      message: `Batch count changed from ${basis.batchCount} to ${live.batchCount} since ` +
        "this plan was built.",
      repair: { type: "rebuild" },
    });
  }
  if (basis.target !== live.target) {
    blocking.push({
      kind: "targetChanged",
      message: `Judges per team changed from ${basis.target} to ${live.target} since this ` +
        "plan was built.",
      repair: { type: "rebuild" },
    });
  }

  // ---- advisory: a label, not a fact the plan depends on ----
  if (JSON.stringify(basis.batchTimes) !== JSON.stringify(live.batchTimes)) {
    advisory.push({
      kind: "batchTimesChanged",
      message: "Batch times changed since this plan was built. The new times will be " +
        "applied to the draft.",
    });
  }

  // ---- advisory: a name changed, nothing about the plan itself did ----
  const staleJudgeIds = basis.judgeIds.filter((id) => liveJudgeIds.has(id));
  for (const judgeId of staleJudgeIds) {
    const before = plan.judgeNames?.[judgeId];
    const after = live.judgeNames?.[judgeId];
    if (before && after && before !== after) {
      advisory.push({ kind: "nameChanged", message: `${before} is now ${after}.` });
    }
  }
  const staleTeamIds = basis.teamIds.filter((id) => liveTeamIds.has(id));
  for (const teamId of staleTeamIds) {
    const before = plan.teamNames?.[teamId];
    const after = live.teamNames?.[teamId];
    if (before && after && before !== after) {
      advisory.push({ kind: "nameChanged", message: `${before} is now ${after}.` });
    }
  }

  return { blocking, advisory };
}

/**
 * Reads the database and shapes a `live` object comparable to a plan's
 * `basis` -- plus `judgeNames` and `teamNames`, so `checkDrift` can name
 * whoever moved.
 *
 * Every filter here has to match `planSchedule` exactly. If this read used a
 * different notion of "submitted" or "eligible", drift would fire on every
 * publish for a difference that was never real -- the two readers just
 * disagreeing about what counts.
 */
export async function readLiveBasis(onlyCheckedIn) {
  const [judgeSnapshot, teamSnapshot, rooms, batchConfig] = await Promise.all([
    get(ref(database, "judges")),
    get(ref(database, "teams")),
    fetchRooms(),
    fetchBatchConfig(),
  ]);

  const judgeData = judgeSnapshot.exists() ? judgeSnapshot.val() : {};
  const teamData = teamSnapshot.exists() ? teamSnapshot.val() : {};

  const roundOneJudges = Object.entries(judgeData)
    .filter(([, details]) => details?.isRound1Judge === true)
    .map(([id, details]) => ({ id, ...details }));

  const judgesList = onlyCheckedIn
    ? roundOneJudges.filter((judge) => judge.checkedIn === true)
    : roundOneJudges;

  const teamsList = Object.entries(teamData)
    .filter(([, details]) => details?.submitted)
    .map(([id, details]) => ({ id, ...details }));

  return {
    teamIds: teamsList.map((t) => t.id).sort(),
    judgeIds: judgesList.map((j) => j.id).sort(),
    rooms,
    batchCount: batchConfig.batchCount,
    batchTimes: batchConfig.batchTimes,
    target: batchConfig.target,
    judgeNames: Object.fromEntries(
      judgesList.map((j) => [j.id, displayName(j, "Unnamed Judge")])
    ),
    teamNames: Object.fromEntries(
      teamsList.map((t) => [t.id, t.name ?? "Unnamed Team"])
    ),
  };
}

export default checkDrift;
