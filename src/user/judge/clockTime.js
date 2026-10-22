/**
 * 12-hour clock times as the schedule writes them ("5:00 PM"), as minutes since
 * midnight.
 *
 * Batch times and team slot times are stored as these display strings, so
 * anything that edits one needs to know whether the text really is a time, and
 * whether "5:00pm" and "5:00 PM" are the same slot. Doing that with string
 * equality or a bare non-empty check lets "banana" through and treats "5:00pm"
 * as a different slot from "5:00 PM". Everything goes through here instead.
 *
 * Accepted: an hour 1-12, optional ":MM" (00-59, two digits), then AM or PM in
 * any case, with optional spaces around and before the meridiem. So "5:00 PM",
 * " 5:00pm ", "5 pm" and "05:00 PM" all read as 5 PM. Rejected: 24-hour times
 * ("17:00"), no meridiem ("5:00"), hour 0 or above 12 ("0:30 AM", "13:00 PM"),
 * minutes above 59, and anything else. A meridiem is required because "5:00"
 * could be either end of the afternoon, and guessing would silently move a slot.
 */

const CLOCK_TIME = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i;

/** Minutes since midnight (0-1439), or null when `text` is not a 12-hour clock time. */
export function parseClockTime(text) {
  const match = CLOCK_TIME.exec(String(text ?? "").trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;

  // 12 AM is midnight and 12 PM is noon, so the 12 wraps to 0 before PM adds 12.
  const pm = match[3].toLowerCase() === "pm";
  return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}

/** Canonical "5:00 PM" for minutes since midnight: no leading zero on the hour, minutes always two digits. */
export function formatClockTime(minutes) {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
}

/** `text` rewritten in the canonical "5:00 PM" form, or null when it is not a clock time. */
export function normalizeClockTime(text) {
  const minutes = parseClockTime(text);
  return minutes === null ? null : formatClockTime(minutes);
}

/** Whether two texts are the same time of day. False when either is not a clock time. */
export function sameClockTime(a, b) {
  const first = parseClockTime(a);
  return first !== null && first === parseClockTime(b);
}
