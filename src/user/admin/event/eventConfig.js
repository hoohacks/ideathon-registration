import { ref, get } from "firebase/database";
import { database } from "../../../firebase.js";
import { applyAdminAction } from "../adminAction.js";
import {
  BATCH_COUNT,
  BATCH_TIMES,
  MIN_JUDGES_PER_TEAM,
  MAX_JUDGES_PER_TEAM,
  panelLabel,
} from "../../judge/schedulePlan.js";
import { FINAL_ROUND_ROOM } from "../../judge/finalRoundService.js";
import { formatClock, parseClock } from "../../judge/finalRoundPlan.js";
import { EVENT_START } from "../../../eventInfo.js";

/**
 * Batch count, batch times, judges per team, event start, and the final round
 * room and timing.
 *
 * All of these were module constants and remain so as fallbacks. Unlike the room
 * list, these are structural rather than venue facts: an event always has some
 * number of batches, so an absent node should behave as it did before rather
 * than refusing to generate. Rooms are the opposite -- there is no sensible
 * default for which rooms a venue booked, so those have no fallback at all.
 *
 * Changing any of these affects the NEXT schedule generation. A schedule
 * already written keeps the times it was built with; that is what the room
 * remap and the per-team slot override are for.
 */

async function readOne(path, fallback) {
  try {
    const snap = await get(ref(database, path));
    return snap.exists() ? snap.val() : fallback;
  } catch {
    return fallback;
  }
}

export async function readEventConfig() {
  const [
    batchCount, batchTimes, minJudgesPerTeam, maxJudgesPerTeam, eventStart, finalRoundRoom,
    finalRoundStart, finalRoundSlotMinutes,
  ] = await Promise.all([
    readOne("config/batchCount", BATCH_COUNT),
    readOne("config/batchTimes", BATCH_TIMES),
    readOne("config/minJudgesPerTeam", MIN_JUDGES_PER_TEAM),
    readOne("config/maxJudgesPerTeam", MAX_JUDGES_PER_TEAM),
    readOne("config/eventStart", EVENT_START),
    readOne("config/finalRoundRoom", FINAL_ROUND_ROOM),
    readOne("config/finalRoundStart", null),
    readOne("config/finalRoundSlotMinutes", null),
  ]);
  return {
    batchCount, batchTimes, minJudgesPerTeam, maxJudgesPerTeam, eventStart, finalRoundRoom,
    finalRoundStart, finalRoundSlotMinutes,
  };
}

export async function setBatchCount(count) {
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    return { ok: false, error: "The batch count must be a whole number between 1 and 12." };
  }

  const before = await readOne("config/batchCount", BATCH_COUNT);
  return applyAdminAction({
    action: "config.batchCount",
    summary: `Batch count ${before} to ${count}`,
    changes: [{ path: "config/batchCount", before, after: count }],
  });
}

export async function setBatchTimes(times) {
  const count = await readOne("config/batchCount", BATCH_COUNT);
  const missing = [];
  for (let batch = 1; batch <= count; batch++) {
    if (!String(times?.[batch] ?? "").trim()) missing.push(batch);
  }
  if (missing.length) {
    return { ok: false, error: `Give every batch a time. Missing: ${missing.join(", ")}.` };
  }

  const before = await readOne("config/batchTimes", BATCH_TIMES);
  return applyAdminAction({
    action: "config.batchTimes",
    summary: `Batch times set for ${count} batch(es)`,
    changes: [{ path: "config/batchTimes", before, after: times }],
  });
}

/**
 * The smallest and largest first-round panel. `max` is null for no cap, which
 * seats every judge. The min is a floor the plan warns about rather than one it
 * refuses to build under: on the day, a thin panel beats no judging.
 */
export async function setJudgesPerTeam({ min, max }) {
  if (!Number.isInteger(min) || min < 1) {
    return { ok: false, error: "The minimum judges per team must be a whole number of at least 1." };
  }
  if (max !== null && (!Number.isInteger(max) || max < min)) {
    return {
      ok: false,
      error: `The maximum judges per team must be a whole number no smaller than the minimum (${min}), or blank for no cap.`,
    };
  }

  const [beforeMin, beforeMax] = await Promise.all([
    readOne("config/minJudgesPerTeam", MIN_JUDGES_PER_TEAM),
    readOne("config/maxJudgesPerTeam", MAX_JUDGES_PER_TEAM),
  ]);
  return applyAdminAction({
    action: "config.judgesPerTeam",
    summary: `Judges per team ${panelLabel(beforeMin, beforeMax)} to ${panelLabel(min, max)}`,
    changes: [
      { path: "config/minJudgesPerTeam", before: beforeMin, after: min },
      { path: "config/maxJudgesPerTeam", before: beforeMax, after: max },
    ],
  });
}

export async function setEventStart(iso) {
  if (Number.isNaN(new Date(iso).getTime())) {
    return { ok: false, error: "That is not a date the browser can read." };
  }

  const before = await readOne("config/eventStart", EVENT_START);
  return applyAdminAction({
    action: "config.eventStart",
    summary: `Event start ${before} to ${iso}`,
    changes: [{ path: "config/eventStart", before, after: iso }],
  });
}

/**
 * Whether teams can hand in their project. Closed until an organizer opens it,
 * so an absent node means closed: a database nobody has touched should not
 * start taking pitches weeks before the event. The rules enforce the same flag.
 */
export async function setSubmissionsOpen(open) {
  const before = (await readOne("config/submissionsOpen", false)) === true;
  const after = open === true;
  if (before === after) return { ok: true };
  return applyAdminAction({
    action: "config.submissionsOpen",
    summary: after ? "Opened project submissions" : "Closed project submissions",
    changes: [{ path: "config/submissionsOpen", before, after }],
  });
}

/**
 * When the form closes by itself, as epoch milliseconds, or null for no
 * deadline (organizers close by hand). A number because the rules compare it
 * with the server's `now`; the page shows it in the event's zone.
 */
export async function setSubmissionsCloseAt(closeAt) {
  const after = closeAt === null || closeAt === undefined ? null : Number(closeAt);
  if (after !== null && !Number.isFinite(after)) {
    return { ok: false, error: "That is not a time the browser can read." };
  }
  const before = await readOne("config/submissionsCloseAt", null);
  if (before === after) return { ok: true };
  return applyAdminAction({
    action: "config.submissionsCloseAt",
    summary: after === null ? "Removed the submission deadline" : `Submission deadline set to ${new Date(after).toISOString()}`,
    changes: [{ path: "config/submissionsCloseAt", before, after }],
  });
}

export async function setFinalRoundRoom(room) {
  const next = String(room ?? "").trim();
  if (!next) return { ok: false, error: "Give the final round a room." };

  const before = await readOne("config/finalRoundRoom", FINAL_ROUND_ROOM);
  return applyAdminAction({
    action: "config.finalRoundRoom",
    summary: `Final round room ${before} to ${next}`,
    changes: [{ path: "config/finalRoundRoom", before, after: next }],
  });
}

/**
 * When the final round starts and how long each finalist gets, so the cards
 * read "5:40 PM" rather than "Slot 2". Both blank clears it, and slots go back
 * to their labels; that is the fallback because there is no sensible default
 * for when a final round starts.
 *
 * Read when the final round is published. A round already published keeps the
 * times it went out with.
 */
export async function setFinalRoundTiming({ start, slotMinutes }) {
  const text = String(start ?? "").trim();
  const cleared = !text && (slotMinutes === null || slotMinutes === undefined);

  let after = { start: null, slotMinutes: null };
  if (!cleared) {
    const startMinutes = parseClock(text);
    if (startMinutes === null) {
      return { ok: false, error: "Give the final round a start time, like 5:30 PM." };
    }
    if (!Number.isInteger(slotMinutes) || slotMinutes < 1 || slotMinutes > 120) {
      return { ok: false, error: "Minutes per team must be a whole number between 1 and 120." };
    }
    after = { start: formatClock(startMinutes), slotMinutes };
  }

  const [beforeStart, beforeMinutes] = await Promise.all([
    readOne("config/finalRoundStart", null),
    readOne("config/finalRoundSlotMinutes", null),
  ]);
  if (beforeStart === after.start && beforeMinutes === after.slotMinutes) return { ok: true };

  return applyAdminAction({
    action: "config.finalRoundTiming",
    summary: cleared
      ? "Cleared the final round times"
      : `Final round starts ${after.start}, ${after.slotMinutes} min per team`,
    changes: [
      { path: "config/finalRoundStart", before: beforeStart, after: after.start },
      { path: "config/finalRoundSlotMinutes", before: beforeMinutes, after: after.slotMinutes },
    ],
  });
}
