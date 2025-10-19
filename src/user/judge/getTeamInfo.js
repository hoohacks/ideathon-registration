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
async function writeScoreToPath({ teamId, teamName, score, pathSegment }) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Must be signed in to submit a score");

  const payload = {
    ...score,
    judgeUid: user.uid,
    teamName,
    submittedAt: serverTimestamp(),
  };

  await set(ref(database, `teams/${teamId}/${pathSegment}/${user.uid}`), payload);
}

export async function writeTeamScore(args) {
  await writeScoreToPath({ ...args, pathSegment: "scores" });
}

export async function writeFinalRoundScore(args) {
  await writeScoreToPath({ ...args, pathSegment: "scores_final_round" });
}

export async function getMyScoredTeamsByName(teamNames) {
  return getScoredTeamsByNameForPath(teamNames, "scores");
}

export async function getMyFinalRoundScoredTeamsByName(teamNames) {
  return getScoredTeamsByNameForPath(teamNames, "scores_final_round");
}

async function getScoredTeamsByNameForPath(teamNames = [], pathSegment) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Must be signed in");
  if (!teamNames.length) return {};

  // check to see if team has already been scored
  const pairs = await Promise.all(
    teamNames.map(async (name) => {
      if (!name) return [name, false];
      const id = await findTeamIdByName(name);
      if (!id) return [name, false];
      const snap = await get(ref(database, `teams/${id}/${pathSegment}/${user.uid}`));
      return [name, snap.exists()];
    })
  );

  const map = {};
  for (const [name, hasScore] of pairs) {
    if (name && hasScore) map[name] = true;
  }
  console.log(map);
  return map;
}
