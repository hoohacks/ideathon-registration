import {
  ref,
  get,
  set,
  onValue,
  serverTimestamp,
} from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";

const SCORE_FIELDS = ["impact", "innovation", "pitch_quality", "problem"];

export function calculateAverageScore(scores = {}) {
  console.log(scores);
  const entries = Object.values(scores);
  if (!entries.length) return null;

  let totalAggregate = 0;
  let judgedCount = 0;

  for (const entry of entries) {
    let judgeTotal = 0;
    let fieldsCounted = 0;

    for (const field of SCORE_FIELDS) {
      const value = Number(entry?.[field]);
      if (!Number.isNaN(value)) {
        judgeTotal += value;
        fieldsCounted += 1;
      }
    }

    if (fieldsCounted > 0) {
      totalAggregate += judgeTotal / fieldsCounted;
      judgedCount += 1;
    }
  }

  if (!judgedCount) return null;
  return totalAggregate / judgedCount;
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

  const timeslots = ["6:00 PM", "6:12 PM", "6:24 PM", "6:36 PM"];

  const teamsPayload = eligibleTeams.reduce((acc, team) => {
    acc[team.teamId] = {
      name: team.name,
      averageScore: team.averageScore,
      excludedJudges: team.excludedJudges,
      timeslot: timeslots.shift() || "TBD",
      room: `Rice 011`,
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
