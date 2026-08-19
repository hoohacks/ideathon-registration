import { ref, get, set, query, orderByChild, equalTo, serverTimestamp } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";

function requireUser() {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Must be signed in");
  return user;
}

// Legacy fallback only. Team names are not unique, so two teams sharing a name
// would send one team's scores to the other. Always prefer the team id carried
// on the assignment.
export async function findTeamIdByName(teamName) {
  let snap;
  try {
    const q = query(ref(database, "teams"), orderByChild("name"), equalTo(teamName));
    snap = await get(q);
  } catch (error) {
    console.warn("Team name lookup is not permitted for this account:", error);
    return null;
  }
  if (!snap.exists()) return null;

  const matches = Object.keys(snap.val());
  if (matches.length > 1) {
    console.warn(`Multiple teams are named "${teamName}"; falling back to the first match.`);
  }
  return matches[0];
}

// write a score for this judge under the team
async function writeScoreToPath({ teamId, teamName, score, pathSegment }) {
  const user = requireUser();
  if (!teamId) throw new Error(`No team id for "${teamName}"`);

  const payload = {
    ...score,
    judgeUid: user.uid,
    teamId,
    teamName,
    submittedAt: serverTimestamp(),
  };

  await set(ref(database, `teams/${teamId}/${pathSegment}/${user.uid}`), payload);
}

export async function writeTeamScore(args) {
  await writeScoreToPath({ ...args, pathSegment: "scores" });
}

export async function writeFinalRoundScore(args) {
  await writeScoreToPath({ ...args, pathSegment: "finalScores" });
}

async function getScoredTeamIdsForPath(teamIds, pathSegment) {
  const user = requireUser();
  const ids = [...new Set((teamIds ?? []).filter(Boolean))];
  if (!ids.length) return new Set();

  const results = await Promise.all(
    ids.map(async (id) => {
      const snap = await get(ref(database, `teams/${id}/${pathSegment}/${user.uid}`));
      return [id, snap.exists()];
    })
  );

  return new Set(results.filter(([, scored]) => scored).map(([id]) => id));
}

export function getMyScoredTeamIds(teamIds) {
  return getScoredTeamIdsForPath(teamIds, "scores");
}

export function getMyFinalRoundScoredTeamIds(teamIds) {
  return getScoredTeamIdsForPath(teamIds, "finalScores");
}
