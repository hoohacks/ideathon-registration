/**
 * Guards the database shapes that live in more than one place.
 *
 * The scoring ranges exist three times over — the selects in ScoreSubmission,
 * SCORE_FIELDS in finalRoundService, and the .validate rules in
 * database.rules.json. If they drift, a judge submits a score the rules reject,
 * or the aggregate quietly weights a criterion wrong. These tests fail on drift
 * rather than waiting for the event to find it.
 */
import fs from "fs";
import path from "path";
import { assignmentList } from "./user/judge/assignmentList";
import { memberIds, isMember } from "./user/team/teamMembers";

const RULES = (() => {
  const raw = fs.readFileSync(path.join(process.cwd(), "database.rules.json"), "utf8");
  // the console strips // comments; JSON.parse will not
  const stripped = raw
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
  return JSON.parse(stripped);
})();

const scoreRules = RULES.rules.teams.$teamId.scores.$judgeId;

// what ScoreSubmission actually sends, and what finalRoundService scores
const EXPECTED_RANGES = {
  problem: 10,
  innovation: 10,
  impact: 10,
  viability: 5,
  pitch_quality: 5,
};

describe("score rules match the code", () => {
  test.each(Object.entries(EXPECTED_RANGES))(
    "%s is validated against its real maximum of %i",
    (field, max) => {
      const rule = scoreRules[field][".validate"];
      expect(rule).toContain("newData.isNumber()");
      expect(rule).toContain("newData.val() >= 1");
      expect(rule).toContain(`newData.val() <= ${max}`);
    }
  );

  test("SCORE_FIELDS agrees with the validated ranges", () => {
    // required lazily so the firebase import chain is not pulled in at module load
    const { SCORE_FIELDS, SCORE_MAX_TOTAL } = jest.requireActual(
      "./user/judge/finalRoundService"
    );
    expect(SCORE_FIELDS).toEqual(EXPECTED_RANGES);
    expect(SCORE_MAX_TOTAL).toBe(40);
  });

  test("every field the app writes is allowed by the rules", () => {
    // ScoreSubmission's score object plus what writeScoreToPath adds
    const written = [
      "problem", "innovation", "impact", "viability", "pitch_quality",
      "fundable", "notes", "teamName", "room", "time",
      "judgeUid", "teamId", "submittedAt",
    ];
    for (const field of written) {
      expect(scoreRules[field]).toBeDefined();
    }
    // anything not enumerated is rejected
    expect(scoreRules.$other[".validate"]).toBe(false);
  });

  test("a judge cannot file a score under another judge", () => {
    expect(scoreRules[".write"]).toContain("auth.uid === $judgeId");
    expect(scoreRules.judgeUid[".validate"]).toContain("auth.uid");
  });

  test("both rounds are validated identically", () => {
    expect(RULES.rules.teams.$teamId.finalScores).toEqual(RULES.rules.teams.$teamId.scores);
  });
});

describe("membership is a keyed set, not an array", () => {
  test("the rules test membership by child key", () => {
    expect(RULES.rules.teams.$teamId[".read"]).toContain("data.child('members').hasChild(auth.uid)");
  });

  test("reads the keyed shape", () => {
    expect(memberIds({ a: true, b: true })).toEqual(["a", "b"]);
    expect(isMember({ a: true }, "a")).toBe(true);
    expect(isMember({ a: true }, "b")).toBe(false);
  });

  test("still reads teams stored before the change", () => {
    expect(memberIds(["a", "b"])).toEqual(["a", "b"]);
  });

  test("ignores removed members and empty values", () => {
    expect(memberIds({ a: true, b: null, c: false })).toEqual(["a"]);
    expect(memberIds(null)).toEqual([]);
    expect(memberIds(undefined)).toEqual([]);
  });
});

describe("judge assignments survive the keyed shape", () => {
  const batch3 = { teamName: "C", batch: 3, room: "R3", time: "5:30 PM" };
  const batch1 = { teamName: "A", batch: 1, room: "R1", time: "5:00 PM" };
  const batch2 = { teamName: "B", batch: 2, room: "R2", time: "5:15 PM" };

  test("object key order does not decide the running order", () => {
    // keys come back lexicographically, which is not batch order
    const stored = { tC: batch3, tA: batch1, tB: batch2 };
    expect(assignmentList(stored).map((a) => a.teamName)).toEqual(["A", "B", "C"]);
  });

  test("still reads schedules stored as an array", () => {
    expect(assignmentList([batch1, batch2, batch3]).map((a) => a.batch)).toEqual([1, 2, 3]);
  });

  test("drops the empty-string placeholder older schedules wrote", () => {
    expect(assignmentList([""])).toEqual([]);
    expect(assignmentList(null)).toEqual([]);
  });
});
