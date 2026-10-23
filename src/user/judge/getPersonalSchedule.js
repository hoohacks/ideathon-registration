// getPersonalSchedule.js
import { ref, onValue } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";
import { assignmentList } from "./assignmentList.js";
import { compareSlots } from "./finalRoundPlan.js";

function requireUser() {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Must be signed in to read personal schedule");
  return user;
}

/**
 * A judge's first-round assignments, kept live.
 *
 * A one-shot `get` was read once when the page mounted and never again, so a
 * judge who left the judging page open all day never saw a room fix, a
 * reassignment, or a republished schedule -- their card just went stale next
 * to them while it happened. Subscribing to the judge's own assignment node
 * means an organizer's edit reaches an open tab the same way `.info/connected`
 * already does, without the judge having to reload.
 *
 * Returns the unsubscribe function directly, the same shape `onValue` itself
 * returns, so the caller's effect cleanup is a one-liner.
 */
export function subscribeToPersonalSchedule(onTeams, onError) {
  const user = requireUser();
  return onValue(
    ref(database, `judges/${user.uid}/teamAssignments`),
    (snap) => onTeams(assignmentList(snap.exists() ? snap.val() : null)),
    (error) => {
      if (onError) onError(error);
    }
  );
}

// final entries have no batch, so assignmentList leaves them in team id order;
// the running order is the slot
function toFinalRoundList(raw) {
  return assignmentList(raw)
    .map((entry) => ({
      ...entry,
      id: entry.teamId ?? entry.id,
      time: entry.timeslot ?? entry.time,
    }))
    .sort((a, b) => compareSlots(a.time, b.time));
}

/**
 * A judge's own final-round list, kept live.
 *
 * It is read from their own judge record rather than derived from /finalRound,
 * which a judge cannot read: the standings carry every team's average score.
 * Exclusions are applied at activation, so whatever is here is exactly what
 * this judge should see.
 *
 * A one-shot read here was only ever re-run when
 * `finalRound/active` flipped, which meant a final round that was published,
 * then corrected -- a room swap, a panel fix, a republish -- while it stayed
 * active the whole time never reached a judge who already had the page open.
 * Subscribing to the judge's own `finalAssignments` node picks up that edit
 * the moment it is written, the same as `subscribeToPersonalSchedule` does for
 * the first round.
 */
export function subscribeToFinalRoundSchedule(onTeams, onError) {
  const user = requireUser();
  return onValue(
    ref(database, `judges/${user.uid}/finalAssignments`),
    (snap) => onTeams(toFinalRoundList(snap.exists() ? snap.val() : null)),
    (error) => {
      if (onError) onError(error);
    }
  );
}

/**
 * The two facts that decide what a judge with no first-round teams is told:
 * whether a schedule has been published at all (config/scheduleMeta, which any
 * signed-in user may read), and whether they are checked in -- check-in is
 * what puts a judge in the pool the final round is built from.
 *
 * Calls back with { scheduled, checkedIn }, once both have answered and on
 * every change after. A failed read leaves that fact false rather than
 * throwing; the worst outcome is a less specific message.
 */
export function subscribeToJudgingStatus(onStatus) {
  const user = requireUser();
  const status = { scheduled: null, checkedIn: null };
  const emit = () => {
    if (status.scheduled !== null && status.checkedIn !== null) onStatus({ ...status });
  };
  const watch = (path, key) =>
    onValue(
      ref(database, path),
      (snap) => {
        status[key] = key === "checkedIn" ? snap.val() === true : snap.exists();
        emit();
      },
      (error) => {
        console.warn(`Could not read ${path}:`, error);
        status[key] = false;
        emit();
      }
    );

  const stops = [
    watch("config/scheduleMeta", "scheduled"),
    watch(`judges/${user.uid}/checkedIn`, "checkedIn"),
  ];
  return () => stops.forEach((stop) => stop());
}
