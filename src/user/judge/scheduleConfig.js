import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { personName } from "../../roles.js";
import { FIRST_ROUND } from "./getTeamInfo.js";
import { BATCH_COUNT, BATCH_TIMES, MIN_JUDGES_PER_TEAM, MAX_JUDGES_PER_TEAM } from "./schedulePlan.js";

// The judging rooms live at config/judgingRooms and nowhere else. There is
// deliberately no fallback list here: a hardcoded one silently papers over an
// empty config, so an organizer who removed a room on the control panel would
// see it come back at the next generation, and nobody could tell whether the
// rooms in use were the ones they had chosen or the ones the build shipped
// with. Rooms are venue facts, not code. Add them on the control panel.

/**
 * The configured rooms, or an empty list.
 *
 * Returning [] rather than a built-in list is the point: an empty config is a
 * real state that has to stop a generation with a clear message, not one that
 * quietly succeeds using rooms nobody chose. A read failure is also [] -- both
 * mean "we do not know the rooms", and guessing would send teams to rooms the
 * event may not have booked.
 */
export async function fetchRooms() {
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

const BUILT_IN = {
    batchCount: BATCH_COUNT,
    batchTimes: BATCH_TIMES,
    minPerTeam: MIN_JUDGES_PER_TEAM,
    maxPerTeam: MAX_JUDGES_PER_TEAM,
};

/** A whole number of at least one, or undefined. */
function positiveInteger(snap) {
    if (!snap.exists()) return undefined;
    const value = Number(snap.val());
    return Number.isInteger(value) && value >= 1 ? value : undefined;
}

/**
 * Batch count, times and panel size, overridable at config/* so the shape of
 * the day can change without a deploy. Same fallback contract as fetchRooms: an
 * absent or malformed node behaves exactly as the built-in constants did,
 * rather than producing an event with zero batches.
 *
 * `maxPerTeam` is null for no cap, which is also the built-in value. A max
 * below the min is ignored rather than trusted, since the allocator would
 * then never reach the min.
 */
export async function fetchBatchConfig() {
    try {
        const [countSnap, timesSnap, minSnap, maxSnap] = await Promise.all([
            get(ref(database, "config/batchCount")),
            get(ref(database, "config/batchTimes")),
            get(ref(database, "config/minJudgesPerTeam")),
            get(ref(database, "config/maxJudgesPerTeam")),
        ]);

        const times = timesSnap.exists() ? timesSnap.val() : BATCH_TIMES;
        const minPerTeam = positiveInteger(minSnap) ?? MIN_JUDGES_PER_TEAM;
        const max = positiveInteger(maxSnap);

        return {
            batchCount: positiveInteger(countSnap) ?? BATCH_COUNT,
            batchTimes: times && typeof times === "object" ? times : BATCH_TIMES,
            minPerTeam,
            maxPerTeam: max !== undefined && max >= minPerTeam ? max : MAX_JUDGES_PER_TEAM,
        };
    } catch (error) {
        console.warn("Could not read the batch config, using the built-in values:", error);
        return { ...BUILT_IN };
    }
}

/** The shared one, under the name the judging modules already import. */
export function displayName(person, fallback) {
    return personName(person, fallback);
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
