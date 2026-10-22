/**
 * The shape of the final round, decided before anything is written.
 *
 * This is to `finalRoundService` what `schedulePlan` is to `planSchedule`: the
 * arithmetic, with no Firebase in it, so the answer is available before the
 * write and testable without an emulator.
 *
 * Two things drive the whole file.
 *
 * 1. **One room, teams in sequence.** The final round is not a second first
 *    round. Every finalist presents to the same panel, one after another, so
 *    there is no "judge in two rooms at once" to check for -- there is one
 *    room. What an organizer edits is who is on a panel, and what order the
 *    teams go in.
 *
 * 2. **Everyone present judges everyone.** Because the finalists present one
 *    after another to the room, whoever is in that room hears every pitch, so
 *    every eligible judge is seated on every finalist. Scoring a team in round
 *    one bars nobody -- the pool is made of organizers who judged round one,
 *    so a per-team exclusion would punch a different hole in every panel and,
 *    at a small event, leave a finalist with nobody able to score it.
 */

/** Slot labels are 1-based; `order` is not. */
export function slotLabel(order) {
  return `Slot ${order + 1}`;
}

/**
 * A clock time as minutes past midnight, or null if it is not one.
 *
 * Takes what an organizer types into the batch-time fields -- "5:30 PM",
 * "5:30pm", "5 PM" -- and the 24-hour "17:30" a time input produces.
 */
export function parseClock(text) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(String(text ?? "").trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.[0].toLowerCase();
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === "p" ? 12 : 0);
  } else if (match[2] === undefined || hours > 23) {
    // a bare "5" is not a time anybody meant
    return null;
  }
  return hours * 60 + minutes;
}

/** Minutes past midnight as "5:30 PM", the way the batch times are written. */
export function formatClock(total) {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = String(wrapped % 60).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * config/finalRoundStart and config/finalRoundSlotMinutes as one value, or
 * null unless both are usable. Half a setting is no setting: slots fall back
 * to their labels rather than inventing a start or a length.
 */
export function finalTiming(start, slotMinutes) {
  const startMinutes = parseClock(start);
  const length = Number(slotMinutes);
  if (startMinutes === null || !Number.isInteger(length) || length < 1) return null;
  return { startMinutes, slotMinutes: length };
}

/**
 * What a finalist's card says for when it presents: a clock time when the
 * final round has a start and a slot length, its slot label otherwise.
 */
export function slotTime(order, timing) {
  return timing ? formatClock(timing.startMinutes + order * timing.slotMinutes) : slotLabel(order);
}

/**
 * The inverse of slotLabel and slotTime, for sorting what was published.
 * Judges' and teams' copies carry only the label, not `order`, and "Slot 10"
 * sorts before "Slot 2" as text, as "10:00 AM" does before "9:30 AM". Anything
 * else -- a free-text time from a forced entry -- sorts after every slotted
 * team. A round that runs past midnight is not handled.
 */
export function slotOrder(label) {
  const text = String(label ?? "").trim();
  const match = /^Slot (\d+)$/.exec(text);
  if (match) return Number(match[1]) - 1;
  return parseClock(text) ?? Infinity;
}

/** Comparator over slot labels; safe with two unslotted entries. */
export function compareSlots(a, b) {
  const x = slotOrder(a);
  const y = slotOrder(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

/**
 * Build the plan an organizer starts from.
 *
 * The cut is the top `size` of `ranked`, in rank order, and every finalist's
 * panel is prefilled with the whole pool -- which is exactly what activation
 * used to derive at the moment of the write. The difference is that this is now
 * a starting point rather than the answer: an organizer who wants a smaller
 * panel on one team takes people off it.
 *
 * Pure. `ranked` must already be sorted; ranking is `scoreRubric`'s job.
 */
export function buildFinalPlan({ ranked = [], pool = [], size = 4, room = "" }) {
  const assignments = {};
  ranked.slice(0, size).forEach((team, order) => {
    assignments[team.teamId] = {
      teamId: team.teamId,
      teamName: team.name,
      order,
      judges: [...pool],
    };
  });

  return {
    version: 0,
    room,
    size,
    ranked,
    assignments,
    pool,
    edits: [],
    basis: {
      cardCounts: Object.fromEntries(ranked.map((team) => [team.teamId, team.judgeCount])),
      eligibleJudges: Object.fromEntries(pool.map((judge) => [judge.judgeId, true])),
      size,
      room,
    },
  };
}

/** The finalists, in the order they present. */
export function slotsOf(plan) {
  return Object.values(plan?.assignments ?? {}).sort((a, b) => a.order - b.order);
}

/**
 * What the plan looks like right now, for the bar above the grid.
 *
 * A hand-edited plan carries none of the prefill's properties, so this reports
 * what is actually there rather than what a fresh build would have produced.
 */
export function finalStats(plan) {
  const slots = slotsOf(plan);
  const panelSizes = slots.map((slot) => slot.judges.length);

  const working = new Set();
  for (const slot of slots) for (const judge of slot.judges) working.add(judge.judgeId);

  return {
    finalists: slots.length,
    ranked: (plan?.ranked ?? []).length,
    minPanel: panelSizes.length ? Math.min(...panelSizes) : 0,
    maxPanel: panelSizes.length ? Math.max(...panelSizes) : 0,
    // a team nobody is judging presents to an empty room -- the one number
    // here that is always a mistake
    unjudged: slots.filter((slot) => slot.judges.length === 0).map((slot) => slot.teamName),
    idle: (plan?.pool ?? []).filter((judge) => !working.has(judge.judgeId)).length,
    edits: (plan?.edits ?? []).length,
  };
}
