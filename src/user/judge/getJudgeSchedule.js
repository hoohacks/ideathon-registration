import { ref, get, update } from "firebase/database";
import { database } from "../../firebase.js";
import { assignmentList } from "./assignmentList.js";

// Fallback room list. Override it at config/judgingRooms in the database to add
// rooms without shipping a new build.
export const DEFAULT_ROOMS = [
    "Rice 110",
    "Rice 109",
    "Rice 108",
    "Rice 103",
    "Rice 204",
    "Rice 011",
    "Rice 032",
    "Rice 303",
    "Rice 314",
    "Rice 514",
    "Rice 540",
    "Rice 414",
];

export const BATCH_COUNT = 3;

export const BATCH_TIMES = {
    1: "5:00 PM",
    2: "5:15 PM",
    3: "5:30 PM",
};

// Teams are split into BATCH_COUNT contiguous groups whose sizes differ by at
// most one, so every batch runs for roughly the same length of time.
export function splitIntoBatches(items, batchCount = BATCH_COUNT) {
    const base = Math.floor(items.length / batchCount);
    const remainder = items.length % batchCount;
    const batches = [];
    let cursor = 0;
    for (let b = 0; b < batchCount; b++) {
        const size = base + (b < remainder ? 1 : 0);
        batches.push(items.slice(cursor, cursor + size));
        cursor += size;
    }
    return batches;
}

// Plain round robin sends judge j to team (j % size) in every batch, which puts
// the same group of judges in a room together all three times. Rotating by
// batchIndex * floor(j / size) keeps the split perfectly even -- each complete
// block of `size` judges still covers every team exactly once -- while
// reshuffling who shares a room.
export function teamIndexFor(judgeIndex, batchIndex, batchSize) {
    return (judgeIndex + batchIndex * Math.floor(judgeIndex / batchSize)) % batchSize;
}

async function fetchRooms() {
    try {
        const snapshot = await get(ref(database, "config/judgingRooms"));
        if (snapshot.exists()) {
            const value = snapshot.val();
            const rooms = (Array.isArray(value) ? value : Object.values(value))
                .filter((room) => typeof room === "string" && room.trim().length > 0);
            if (rooms.length) return rooms;
        }
    } catch (error) {
        console.warn("Could not read config/judgingRooms, using the built-in list:", error);
    }
    return DEFAULT_ROOMS;
}

function displayName(person, fallback) {
    const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
    return name || fallback;
}

/**
 * Builds the first round judging schedule and writes it to the database.
 *
 * Teams are split into three batches that each present at a different time.
 * Within a batch every team gets its own room, and every judge is sent to
 * exactly one team per batch, so no judge is ever double booked.
 *
 * Returns { ok, error, warnings, stats, assignments }. It never throws, and it
 * never writes a partial schedule -- validation runs before anything is saved.
 */
export async function getJudgeSchedule() {
    const warnings = [];
    const fail = (error) => ({ ok: false, error, warnings, stats: null, assignments: [] });

    try {
        const [judgeSnapshot, teamSnapshot, rooms] = await Promise.all([
            get(ref(database, "judges")),
            get(ref(database, "teams")),
            fetchRooms(),
        ]);

        if (!judgeSnapshot.exists()) return fail("There are no judges registered yet.");
        if (!teamSnapshot.exists()) return fail("There are no teams registered yet.");

        const judgeData = judgeSnapshot.val();
        const teamData = teamSnapshot.val();

        const judgesList = Object.entries(judgeData)
            .filter(([, details]) => details?.isRound1Judge === true)
            .map(([id, details]) => ({ id, ...details }));

        const teamsList = Object.entries(teamData)
            .filter(([, details]) => details?.submitted)
            .map(([id, details]) => ({ id, ...details }));

        // ---- validate before touching the database ----

        if (!judgesList.length) {
            return fail(
                "No judges are marked as first round judges. Mark them on the Judge Search page, then generate again."
            );
        }

        if (!teamsList.length) {
            return fail("No teams have submitted a project yet, so there is nothing to judge.");
        }

        const batches = splitIntoBatches(teamsList).filter((batch) => batch.length > 0);
        const largestBatch = Math.max(...batches.map((batch) => batch.length));

        if (largestBatch > rooms.length) {
            return fail(
                `${teamsList.length} teams need ${largestBatch} rooms per batch but only ${rooms.length} are configured. ` +
                "Add rooms at config/judgingRooms in the database, then generate again."
            );
        }

        const judgesPerTeam = Math.floor(judgesList.length / largestBatch);
        if (judgesPerTeam < 1) {
            return fail(
                `Only ${judgesList.length} first round judges for batches of up to ${largestBatch} teams. ` +
                `At least ${largestBatch} judges are needed so every team is seen.`
            );
        }
        if (judgesPerTeam < 2) {
            warnings.push(
                `Some teams will only be seen by one judge. Mark at least ${largestBatch * 2} first round judges to get two per team.`
            );
        }
        if (teamsList.some((team) => !team.name)) {
            warnings.push("Some submitted teams have no name and will show up blank on the schedule.");
        }

        // ---- build the schedule ----

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
                    time: BATCH_TIMES[batchNumber] ?? "TBD",
                    batch: batchNumber,
                    judges: [],
                };
            });

            judgesList.forEach((judge, judgeIndex) => {
                const seat = teamIndexFor(judgeIndex, batchIndex, batch.length);
                const assignment = teamAssignments[batch[seat].id];
                assignment.judges.push({
                    judgeName: displayName(judge, "Unnamed Judge"),
                    judgeId: judge.id,
                });
                assignmentsByJudge[judge.id][batch[seat].id] = assignment;
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

        // ---- write everything in one atomic update ----

        const updates = {};

        // Judges who are no longer eligible must not keep a stale schedule.
        Object.keys(judgeData).forEach((judgeId) => {
            updates[`judges/${judgeId}/teamAssignments`] = assignmentsByJudge[judgeId] ?? null;
        });

        // Same for teams that withdrew their submission since the last run.
        Object.keys(teamData).forEach((teamId) => {
            updates[`teams/${teamId}/schedule`] = teamAssignments[teamId] ?? null;
        });

        await update(ref(database), updates);

        const judgeCounts = Object.values(teamAssignments).map((a) => a.judges.length);

        return {
            ok: true,
            error: null,
            warnings,
            stats: {
                teams: teamsList.length,
                judges: judgesList.length,
                batchSizes: batches.map((batch) => batch.length),
                roomsUsed: largestBatch,
                minJudgesPerTeam: Math.min(...judgeCounts),
                maxJudgesPerTeam: Math.max(...judgeCounts),
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

export default getJudgeSchedule;
