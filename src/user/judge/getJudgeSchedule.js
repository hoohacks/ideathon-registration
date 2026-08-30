import { ref, get, update, push, serverTimestamp } from "firebase/database";
import { database } from "../../firebase.js";
import { requireAdmin } from "../../roles.js";
import { assignmentList } from "./assignmentList.js";
import { FIRST_ROUND } from "./getTeamInfo.js";
import { guardWith } from "../admin/snapshots.js";
import { resolveName } from "../admin/adminAction.js";
import {
  splitIntoBatches,
  allocateBatch,
  describeSupply,
  BATCH_COUNT,
  BATCH_TIMES,
  TARGET_JUDGES_PER_TEAM,
} from "./schedulePlan.js";

// The judging rooms live at config/judgingRooms and nowhere else. There is
// deliberately no fallback list here: a hardcoded one silently papers over an
// empty config, so an organizer who removed a room on the control panel would
// see it come back at the next generation, and nobody could tell whether the
// rooms in use were the ones they had chosen or the ones the build shipped
// with. Rooms are venue facts, not code. Add them on the control panel.

// Re-exported so the existing imports across the app keep working; the
// arithmetic itself now lives in schedulePlan.js, where it can be tested
// without a database.
export { splitIntoBatches, BATCH_COUNT, BATCH_TIMES, TARGET_JUDGES_PER_TEAM };

/**
 * The configured rooms, or an empty list.
 *
 * Returning [] rather than a built-in list is the point: an empty config is a
 * real state that has to stop a generation with a clear message, not one that
 * quietly succeeds using rooms nobody chose. A read failure is also [] -- both
 * mean "we do not know the rooms", and guessing would send teams to rooms the
 * event may not have booked.
 */
async function fetchRooms() {
    try {
        const snapshot = await get(ref(database, "config/judgingRooms"));
        if (!snapshot.exists()) return [];

        const value = snapshot.val();
        return (Array.isArray(value) ? value : Object.values(value))
            .filter((room) => typeof room === "string" && room.trim().length > 0);
    } catch (error) {
        console.warn("Could not read config/judgingRooms:", error);
        return [];
    }
}

/**
 * Batch count, times and panel size, overridable at config/* so the shape of
 * the day can change without a deploy. Same fallback contract as fetchRooms: an
 * absent or malformed node behaves exactly as the built-in constants did,
 * rather than producing an event with zero batches.
 */
export async function fetchBatchConfig() {
    try {
        const [countSnap, timesSnap, targetSnap] = await Promise.all([
            get(ref(database, "config/batchCount")),
            get(ref(database, "config/batchTimes")),
            get(ref(database, "config/targetJudgesPerTeam")),
        ]);

        const count = countSnap.exists() ? Number(countSnap.val()) : BATCH_COUNT;
        const times = timesSnap.exists() ? timesSnap.val() : BATCH_TIMES;
        const target = targetSnap.exists() ? Number(targetSnap.val()) : TARGET_JUDGES_PER_TEAM;

        return {
            batchCount: Number.isInteger(count) && count >= 1 ? count : BATCH_COUNT,
            batchTimes: times && typeof times === "object" ? times : BATCH_TIMES,
            target: Number.isInteger(target) && target >= 1 ? target : TARGET_JUDGES_PER_TEAM,
        };
    } catch (error) {
        console.warn("Could not read the batch config, using the built-in values:", error);
        return { batchCount: BATCH_COUNT, batchTimes: BATCH_TIMES, target: TARGET_JUDGES_PER_TEAM };
    }
}

function displayName(person, fallback) {
    const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
    return name || fallback;
}

/**
 * Builds the first round judging schedule and writes it to the database.
 *
 * Teams are split into batches that each present at a different time. Within a
 * batch every team gets its own room, and every judge is sent to at most one
 * team per batch, so no judge is ever double booked.
 *
 * Returns { ok, error, warnings, advice, stats, assignments }. It never throws,
 * and it never writes a partial schedule -- validation runs before anything is
 * saved, and a restore point is taken before anything is replaced.
 *
 * `onlyCheckedIn` restricts the pool to judges who have actually arrived.
 * Check-in state used to be ignored entirely, so a judge who never turned up
 * still got a third of the rooms and the teams they were sent to went unseen,
 * with nothing anywhere reporting it.
 */
export async function getJudgeSchedule({ onlyCheckedIn = false } = {}) {
    const warnings = [];
    const fail = (error, advice = []) => ({
        ok: false, error, warnings, advice, stats: null, assignments: [],
    });

    try {
        // a guard rail, not the boundary: the root rule is what actually stops
        // a non-admin, but failing here gives a usable message instead of a
        // bare PERMISSION_DENIED from a multi-path update
        const admin = await requireAdmin("generate the judging schedule");
        const [judgeSnapshot, teamSnapshot, rooms, batchConfig] = await Promise.all([
            get(ref(database, "judges")),
            get(ref(database, "teams")),
            fetchRooms(),
            fetchBatchConfig(),
        ]);

        if (!judgeSnapshot.exists()) return fail("There are no judges registered yet.");
        if (!teamSnapshot.exists()) return fail("There are no teams registered yet.");

        const judgeData = judgeSnapshot.val();
        const teamData = teamSnapshot.val();

        const roundOneJudges = Object.entries(judgeData)
            .filter(([, details]) => details?.isRound1Judge === true)
            .map(([id, details]) => ({ id, ...details }));

        const judgesList = onlyCheckedIn
            ? roundOneJudges.filter((judge) => judge.checkedIn === true)
            : roundOneJudges;

        const absent = roundOneJudges.length - judgesList.length;
        if (onlyCheckedIn && absent > 0) {
            warnings.push(`${absent} first round judge(s) have not checked in and were left out.`);
        }

        const teamsList = Object.entries(teamData)
            .filter(([, details]) => details?.submitted)
            .map(([id, details]) => ({ id, ...details }));

        // ---- validate before touching the database ----

        if (!judgesList.length) {
            return fail(
                onlyCheckedIn && roundOneJudges.length
                    ? "None of the first round judges have checked in yet. Check them in on the Judge Search page, or generate without the check-in filter."
                    : "No judges are marked as first round judges. Mark them on the Judge Search page, then generate again."
            );
        }

        // Every supply question -- too few rooms, too few judges, too many
        // judges for too few teams, batches that do not divide evenly -- is
        // answered in one place, with numbers the organizer can act on.
        const supply = describeSupply({
            teamCount: teamsList.length,
            judgeCount: judgesList.length,
            roomCount: rooms.length,
            batchCount: batchConfig.batchCount,
            target: batchConfig.target,
        });

        if (!supply.ok) return fail(supply.error, supply.advice);
        warnings.push(...supply.warnings);

        if (teamsList.some((team) => !team.name)) {
            warnings.push("Some submitted teams have no name and will show up blank on the schedule.");
        }

        // ---- build the schedule ----

        const batches = splitIntoBatches(teamsList, batchConfig.batchCount)
            .filter((batch) => batch.length > 0);

        const teamAssignments = {};
        // keyed by team id rather than an array: rules can address a single
        // assignment, and deleting one cannot renumber the rest
        const assignmentsByJudge = {};
        judgesList.forEach((judge) => {
            assignmentsByJudge[judge.id] = {};
        });

        batches.forEach((batch, batchIndex) => {
            const batchNumber = batchIndex + 1;

            batch.forEach((team, seat) => {
                teamAssignments[team.id] = {
                    teamName: team.name ?? "Unnamed Team",
                    id: team.id,
                    room: rooms[seat],
                    time: batchConfig.batchTimes[batchNumber] ?? "TBD",
                    batch: batchNumber,
                    judges: [],
                };
            });

            const panels = allocateBatch({
                judgeCount: judgesList.length,
                batchSize: batch.length,
                batchIndex,
                target: batchConfig.target,
            });

            panels.forEach((panel, seat) => {
                const assignment = teamAssignments[batch[seat].id];
                panel.forEach((judgeIndex) => {
                    const judge = judgesList[judgeIndex];
                    assignment.judges.push({
                        judgeName: displayName(judge, "Unnamed Judge"),
                        judgeId: judge.id,
                    });
                    assignmentsByJudge[judge.id][batch[seat].id] = assignment;
                });
            });
        });

        const unjudged = Object.values(teamAssignments).filter((a) => a.judges.length === 0);
        if (unjudged.length) {
            // Unreachable given the checks above, but refuse to write rather than
            // send a team to a room nobody is coming to.
            return fail(
                `${unjudged.length} team(s) ended up with no judges (${unjudged
                    .map((a) => a.teamName)
                    .join(", ")}). Nothing was saved.`
            );
        }

        // Name the teams an organizer might still want to do something about,
        // rather than saying "some teams" and leaving them to find out which.
        const thin = Object.values(teamAssignments).filter((a) => a.judges.length < 2);
        if (thin.length) {
            warnings.push(
                `Seen by one judge only: ${thin.map((a) => a.teamName).join(", ")}. ` +
                "Add a judge to these from Judging progress."
            );
        }

        const spare = judgesList.filter((judge) => !Object.keys(assignmentsByJudge[judge.id]).length);
        if (spare.length) {
            warnings.push(
                `${spare.length} judge(s) have no assignment at all and are spares: ` +
                `${spare.map((j) => displayName(j, "Unnamed Judge")).join(", ")}.`
            );
        }

        // How often the same two judges share a room more than once. Informational.
        const seenPairs = new Set();
        let repeatPairings = 0;
        Object.values(teamAssignments).forEach(({ judges }) => {
            for (let i = 0; i < judges.length; i++) {
                for (let j = i + 1; j < judges.length; j++) {
                    const key = [judges[i].judgeId, judges[j].judgeId].sort().join("-");
                    if (seenPairs.has(key)) repeatPairings += 1;
                    else seenPairs.add(key);
                }
            }
        });

        // ---- restore point, before anything is replaced ----
        //
        // Regenerating rewrites every assignment in the event. It used to do so
        // with a bare update() -- no audit entry, no before-state, no undo --
        // which made the single most destructive button in the app the only one
        // with no way back.
        const guard = await guardWith({
            label: `Before generating the schedule (${teamsList.length} teams, ${judgesList.length} judges)`,
            reason: "schedule generation replaces every assignment in the event",
            paths: ["teams", "judges", "config/scheduleMeta"],
        });
        if (!guard.ok) return fail(guard.error);

        // ---- write everything in one atomic update ----

        const updates = {};

        // Judges who are no longer eligible must not keep a stale schedule.
        Object.keys(judgeData).forEach((judgeId) => {
            const assignments = assignmentsByJudge[judgeId];
            updates[`judges/${judgeId}/teamAssignments`] =
                assignments && Object.keys(assignments).length ? assignments : null;
        });

        // Same for teams that withdrew their submission since the last run.
        Object.keys(teamData).forEach((teamId) => {
            updates[`teams/${teamId}/schedule`] = teamAssignments[teamId] ?? null;
        });

        // Written so the regenerate confirmation survives a page reload. It
        // used to hang off React state, which meant a refresh silently removed
        // the only thing standing between a stray click and every assignment in
        // the event being replaced.
        updates["config/scheduleMeta"] = {
            generatedAt: serverTimestamp(),
            generatedBy: admin.uid,
            teams: teamsList.length,
            judges: judgesList.length,
            onlyCheckedIn,
        };

        // The audit entry goes out in the SAME update as the schedule, so a
        // dropped connection cannot land one without the other. Its changes are
        // omitted deliberately: the before-state is in the restore point above,
        // which is precisely what the log's size cap could not hold.
        const entryId = push(ref(database, "adminLog")).key;
        updates[`adminLog/${entryId}`] = {
            at: serverTimestamp(),
            by: admin.uid,
            byName: await resolveName(admin.uid),
            action: "schedule.generate",
            summary:
                `Generated the judging schedule: ${teamsList.length} teams, ${judgesList.length} judges` +
                `${onlyCheckedIn ? ", checked-in only" : ""}. Restore point taken first.`,
            undoable: false,
        };

        await update(ref(database), updates);

        const judgeCounts = Object.values(teamAssignments).map((a) => a.judges.length);

        return {
            ok: true,
            error: null,
            warnings,
            advice: supply.advice,
            snapshotId: guard.snapshotId,
            stats: {
                teams: teamsList.length,
                judges: judgesList.length,
                batchSizes: batches.map((batch) => batch.length),
                roomsUsed: Math.max(...batches.map((batch) => batch.length)),
                minJudgesPerTeam: Math.min(...judgeCounts),
                maxJudgesPerTeam: Math.max(...judgeCounts),
                spareJudges: spare.length,
                repeatPairings,
            },
            assignments: judgesList.map((judge) => ({
                judgeId: judge.id,
                judgeName: displayName(judge, "Unnamed Judge"),
                teamAssignments: assignmentList(assignmentsByJudge[judge.id]),
            })),
        };
    } catch (error) {
        console.error("Error generating judge schedule:", error);
        return fail(error.message || "Something went wrong generating the schedule.");
    }
}

/**
 * What the last generation did, plus how much scoring has happened since.
 *
 * The scored count is read live rather than stored, because it is the number
 * that makes regenerating dangerous: scores are keyed by team and judge, so
 * moving assignments does not delete them -- it strands them. They keep
 * counting toward the averages while belonging to a judge who is no longer
 * assigned, which is invisible unless someone is told.
 */
export async function readScheduleMeta() {
    const [metaSnap, scoresSnap] = await Promise.all([
        get(ref(database, "config/scheduleMeta")),
        get(ref(database, `scores/${FIRST_ROUND}`)),
    ]);

    if (!metaSnap.exists()) return null;

    return {
        ...metaSnap.val(),
        scoredTeams: scoresSnap.exists() ? Object.keys(scoresSnap.val() ?? {}).length : 0,
    };
}

export default getJudgeSchedule;
