// getPersonalSchedule.js
import { ref, get } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";
import { assignmentList } from "./assignmentList.js";

function requireUser() {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Must be signed in to read personal schedule");
  return user;
}

export async function getPersonalSchedule() {
  const user = requireUser();

  const snap = await get(ref(database, `judges/${user.uid}`));
  if (!snap.exists()) return [];

  return assignmentList(snap.val().teamAssignments);
}

/**
 * The judge's own final-round list.
 *
 * Read from their own judge record rather than derived from /finalRound, which
 * is no longer readable by a judge — the standings carry every team's average
 * score, and handing those to anyone before the announcement is the leak this
 * denormalisation closes. Exclusions are applied at activation, so whatever is
 * here is exactly what this judge should see.
 */
export async function getFinalRoundSchedule() {
  const user = requireUser();

  const snap = await get(ref(database, `judges/${user.uid}/finalAssignments`));
  if (!snap.exists()) return [];

  // final assignments have no batch, so assignmentList's sort is a no-op here;
  // it is still the one place that copes with the legacy array shape
  return assignmentList(snap.val()).map((entry) => ({
    ...entry,
    id: entry.teamId ?? entry.id,
    time: entry.timeslot ?? entry.time,
  }));
}
