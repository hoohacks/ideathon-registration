import { ref, get, set, query, orderByChild, equalTo, serverTimestamp } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";

// find teamid from name
export async function findTeamIdByName(teamName) {
  const q = query(ref(database, "teams"), orderByChild("name"), equalTo(teamName));
  const snap = await get(q);
  if (!snap.exists()) return null;

  // return the first match's key
  const obj = snap.val();
  return Object.keys(obj)[0];
}

// write a score for this judge under the team
export async function writeTeamScore({ teamId, teamName, score }) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Must be signed in to submit a score");

  const payload = {
    ...score,
    judgeUid: user.uid,
    teamName,
    submittedAt: serverTimestamp(),
  };

  await set(ref(database, `teams/${teamId}/scores/${user.uid}`), payload);
}
