// getPersonalSchedule.js
import { ref, get } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";
import { assignmentList } from "./assignmentList.js";

export async function getPersonalSchedule() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Must be signed in to read personal schedule");

  const judgeRef = ref(database, `judges/${user.uid}`);
  const snap = await get(judgeRef);
  if (!snap.exists()) return [];

  return assignmentList(snap.val().teamAssignments);
}
