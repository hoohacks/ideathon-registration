import {
  ref,
  get,
  set,
  onValue,
  serverTimestamp,
} from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";

// Each rubric criterion and the maximum a judge can award for it. These must
// stay in step with the selects in ScoreSubmission -- a criterion missing here
// is collected from judges and then silently thrown away.
export const SCORE_FIELDS = {
  problem: 10,
  innovation: 10,
  impact: 10,
  viability: 5,
  pitch_quality: 5,
};

export const SCORE_MAX_TOTAL = Object.values(SCORE_FIELDS).reduce((a, b) => a + b, 0);

// Score one judge's card out of SCORE_MAX_TOTAL. Criteria are summed rather
// than averaged so a 10 point criterion counts twice as much as a 5 point one,
// which is what the differing ranges are for. Fields the judge did not fill in
// are left out of both the total and the denominator, so an older card that
// predates a criterion is not penalised for it.
export function scoreCard(entry) {
  let earned = 0;
  let possible = 0;

  for (const [field, max] of Object.entries(SCORE_FIELDS)) {
    const raw = entry?.[field];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    earned += value;
    possible += max;
  }

  if (possible === 0) return null;
  return (earned / possible) * SCORE_MAX_TOTAL;
}

export function calculateAverageScore(scores = {}) {
  const entries = Object.values(scores ?? {});
  if (!entries.length) return null;

  const cards = entries.map(scoreCard).filter((value) => value !== null);
  if (!cards.length) return null;

  return cards.reduce((a, b) => a + b, 0) / cards.length;
}

export function countFundableVotes(scores = {}) {
  const entries = Object.values(scores ?? {});
  return entries.filter((entry) => entry?.fundable === true).length;
}

export async function activateFinalRound({ limit = 4 } = {}) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Must be signed in to activate the final round");

  const teamsSnap = await get(ref(database, "teams"));
  if (!teamsSnap.exists()) {
    throw new Error("No teams found to evaluate for the final round");
  }

  const teamsData = teamsSnap.val();
  const teamEntries = Object.entries(teamsData).map(([teamId, team]) => {
    const averageScore = calculateAverageScore(team?.scores);
    // a judge who already saw this team in round one should not judge it again
    const excludedJudges = team?.scores
      ? Object.keys(team.scores).reduce((acc, judgeId) => {
        acc[judgeId] = true;
        return acc;
      }, {})
      : {};

    return {
      teamId,
      name: team?.name ?? "Unnamed Team",
      averageScore,
      excludedJudges,
    };
  });

  const eligibleTeams = teamEntries
    .filter((team) => typeof team.averageScore === "number")
    .sort((a, b) => b.averageScore - a.averageScore)
    .slice(0, limit);

  if (!eligibleTeams.length) {
    throw new Error("No teams have scores yet. Final round cannot be activated.");
  }

  const teamsPayload = eligibleTeams.reduce((acc, team, index) => {
    acc[team.teamId] = {
      name: team.name,
      averageScore: team.averageScore,
      excludedJudges: team.excludedJudges,
      timeslot: `Slot ${index + 1}`,
      room: "Rice 011",
    };
    return acc;
  }, {});

  const payload = {
    active: true,
    activatedAt: serverTimestamp(),
    activatedBy: user.uid,
    teams: teamsPayload,
  };

  await set(ref(database, "finalRound"), payload);
  return payload;
}

export async function deactivateFinalRound() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("Must be signed in to deactivate the final round");

  const payload = {
    active: false,
    deactivatedAt: serverTimestamp(),
    deactivatedBy: user.uid,
    teams: null,
  };

  await set(ref(database, "finalRound"), payload);
  return payload;
}

export function subscribeToFinalRoundState(callback) {
  const finalRoundRef = ref(database, "finalRound");
  const unsubscribe = onValue(
    finalRoundRef,
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : { active: false });
    },
    (error) => {
      console.error("Failed to subscribe to final round state:", error);
      callback({ active: false, error: error.message });
    }
  );

  return () => unsubscribe();
}
