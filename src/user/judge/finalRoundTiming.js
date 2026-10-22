import { ref, onValue } from "firebase/database";
import { database } from "../../firebase.js";
import { parseClockTime, formatClockTime } from "./clockTime.js";
import { slotOrder } from "./finalRoundPlan.js";

/**
 * When each finalist presents.
 *
 * config/finalRoundTime is when the round starts and config/finalRoundSlotMinutes
 * how long each finalist gets. Publishing still writes "Slot 1", "Slot 2"; a
 * finalist's clock time is worked out from that and these two keys wherever it
 * is shown, read live, so moving the start or the slot length after the
 * finalists are out reaches every team and judge without a republish.
 */

/**
 * The start and slot length as one value, or null unless both are usable. Half
 * a setting is no setting: slots keep their labels rather than inventing the
 * missing half.
 */
export function finalTiming(start, slotMinutes) {
  const startMinutes = parseClockTime(start);
  const length = Number(slotMinutes);
  if (startMinutes === null || !Number.isInteger(length) || length < 1) return null;
  return { startMinutes, slotMinutes: length };
}

/**
 * What a published slot reads as: "5:40 PM" for "Slot 2" when the round has a
 * start and a slot length, the label unchanged otherwise -- including a
 * free-text time from a forced entry, which already says when.
 */
export function finalSlotTime(label, timing) {
  const order = slotOrder(label);
  if (!timing || order === Infinity) return label;
  return formatClockTime((timing.startMinutes + order * timing.slotMinutes) % (24 * 60));
}

/**
 * The start as typed (for "Starts at 7:00 PM") and the timing, live. Calls back
 * with { start: null, timing: null } on a read error rather than leaving a
 * stale time on screen.
 */
export function subscribeToFinalRoundTiming(callback) {
  let start = null;
  let slotMinutes = null;
  const emit = () => callback({ start, timing: finalTiming(start, slotMinutes) });
  const onError = (error) => {
    console.error("Failed to subscribe to the final round time:", error);
    start = null;
    slotMinutes = null;
    emit();
  };

  const offStart = onValue(
    ref(database, "config/finalRoundTime"),
    (snapshot) => {
      start = String(snapshot.val() ?? "").trim() || null;
      emit();
    },
    onError
  );
  const offMinutes = onValue(
    ref(database, "config/finalRoundSlotMinutes"),
    (snapshot) => {
      slotMinutes = snapshot.val();
      emit();
    },
    onError
  );

  return () => {
    offStart();
    offMinutes();
  };
}
