/**
 * One-off migration: scores out from under the team node.
 *
 *   before   teams/{teamId}/scores/{judgeUid}       and .../finalScores/{judgeUid}
 *   after    scores/first/{teamId}/{judgeUid}       and scores/final/{teamId}/{judgeUid}
 *
 * Realtime Database rules cascade and cannot be revoked deeper, so the read a
 * team member holds on `teams/$teamId` granted everything beneath it —
 * including every judge's numbers and their free-text notes. Moving the scores
 * to a node nobody has a read on is what closes that.
 *
 * It also backfills the final round's denormalised copies, so an event that is
 * mid-final-round does not have to be reactivated after the deploy.
 *
 * Usage (from the repo root):
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-scores.mjs
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-scores.mjs --apply
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-scores.mjs --rollback scripts/backups/scores-....json
 *
 * Without --apply it only reports what it would change. The account must be
 * present in /admins.
 *
 * READ THE DRY RUN. It validates every legacy record against the rules before
 * anything is written, and that matters more here than anywhere else in this
 * project: the whole migration is a single atomic update, so ONE malformed
 * record rejects the entire thing, and Realtime Database will not tell you
 * which path failed — you get a bare PERMISSION_DENIED for the lot.
 *
 * Publish the frozen cutover rules first (`npm run rules:cutover -- --freeze`).
 * Otherwise a judge who submits between the read below and the write has their
 * card read-missed and then nulled: silently lost.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, update } from "firebase/database";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig } from "../src/firebaseConfig.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = join(repoRoot, "scripts", "backups");

const apply = process.argv.includes("--apply");
const rollbackIndex = process.argv.indexOf("--rollback");
const rollbackFile = rollbackIndex === -1 ? null : process.argv[rollbackIndex + 1];

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD for an account listed in /admins.");
  process.exit(1);
}

// Mirrors the .validate rules in database.rules.json. Kept as data so the two
// can be compared by eye; src/schema.test.js is what stops the ranges drifting.
const RANGES = { problem: 10, innovation: 10, impact: 10, viability: 5, pitch_quality: 5 };
const NOTES_MAX = 2000;
const KEEP = [
  ...Object.keys(RANGES),
  "fundable", "notes", "teamName", "room", "time",
  "judgeUid", "teamId", "enteredBy", "source", "submittedAt",
];

const LEGACY = [
  { key: "scores", round: "first" },
  { key: "finalScores", round: "final" },
];

/**
 * Coerce a legacy record into something the new rules will accept.
 *
 * `$other: false` rejects any field not enumerated, so unknown keys are dropped
 * rather than carried across. `judgeUid` and `teamId` are forced to agree with
 * the path, because the rules pin them to the keys.
 */
function sanitise(raw, { teamId, judgeUid, adminUid }) {
  const out = {};
  const dropped = [];

  for (const [field, value] of Object.entries(raw ?? {})) {
    if (KEEP.includes(field)) out[field] = value;
    else dropped.push(field);
  }

  for (const field of Object.keys(RANGES)) {
    if (out[field] !== undefined && out[field] !== null && out[field] !== "") {
      out[field] = Number(out[field]);
    }
  }

  out.judgeUid = judgeUid;
  out.teamId = teamId;
  out.fundable = out.fundable === true;
  if (typeof out.notes === "string" && out.notes.length > NOTES_MAX) {
    out.notes = out.notes.slice(0, NOTES_MAX);
  }
  if (out.notes !== undefined && typeof out.notes !== "string") delete out.notes;

  // legacy cards predate both fields. enteredBy is required and the rules pin
  // it to auth.uid, which is this script's admin account.
  out.enteredBy = adminUid;
  out.source = "migrated";

  const stamp = Number(out.submittedAt);
  out.submittedAt = Number.isFinite(stamp) && stamp > 0 ? Math.min(stamp, Date.now()) : Date.now();

  for (const field of ["teamName", "room", "time"]) {
    if (out[field] !== undefined && typeof out[field] !== "string") out[field] = String(out[field]);
  }

  return { record: out, dropped };
}

/** Everything that would make the atomic update fail, found before it runs. */
function validate(record) {
  const problems = [];

  for (const [field, max] of Object.entries(RANGES)) {
    const value = record[field];
    if (value === undefined) {
      problems.push(`missing ${field}`);
      continue;
    }
    if (!Number.isFinite(value)) problems.push(`${field} is not a number (${value})`);
    else if (value < 1 || value > max) problems.push(`${field}=${value} outside 1..${max}`);
  }

  if (typeof record.fundable !== "boolean") problems.push("fundable is not a boolean");
  if (!record.judgeUid) problems.push("no judgeUid");
  if (!record.teamId) problems.push("no teamId");
  if (!record.enteredBy) problems.push("no enteredBy");
  if (!Number.isFinite(record.submittedAt)) problems.push("submittedAt is not a number");
  if (record.submittedAt > Date.now()) problems.push("submittedAt is in the future");
  if (record.notes !== undefined && record.notes.length > NOTES_MAX) problems.push("notes too long");

  return problems;
}

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

let adminUid;
try {
  const credential = await signInWithEmailAndPassword(getAuth(app), email, password);
  adminUid = credential.user.uid;
} catch (error) {
  console.error(`Could not sign in: ${error.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- rollback --

if (rollbackFile) {
  const backup = JSON.parse(readFileSync(rollbackFile, "utf8"));
  const updates = {};

  for (const [teamId, byKey] of Object.entries(backup.legacy ?? {})) {
    for (const [key, cards] of Object.entries(byKey)) {
      updates[`teams/${teamId}/${key}`] = cards;
    }
  }
  updates["scores"] = null;

  console.log(`Restoring ${Object.keys(updates).length - 1} legacy score node(s) from ${rollbackFile}`);
  if (!apply) {
    console.log("\nDry run. Add --apply to write the rollback.");
    process.exit(0);
  }

  await update(ref(database), updates);
  console.log("Rolled back. Republish the cutover rules if you have already moved past them.");
  process.exit(0);
}

// ----------------------------------------------------------------- migrate --

const [teamsSnap, judgesSnap, finalSnap] = await Promise.all([
  get(ref(database, "teams")),
  get(ref(database, "judges")),
  get(ref(database, "finalRound/teams")),
]);

if (!teamsSnap.exists()) {
  console.log("No teams found. Nothing to do.");
  process.exit(0);
}

const teams = teamsSnap.val() ?? {};
const judges = judgesSnap.val() ?? {};
const finalists = finalSnap.exists() ? finalSnap.val() ?? {} : {};

const updates = {};
const legacyBackup = {};
const problems = [];
const droppedFields = new Set();
const counts = { first: 0, final: 0 };

for (const [teamId, team] of Object.entries(teams)) {
  for (const { key, round } of LEGACY) {
    const cards = team?.[key];
    if (!cards || typeof cards !== "object") continue;

    legacyBackup[teamId] ??= {};
    legacyBackup[teamId][key] = cards;

    for (const [judgeUid, raw] of Object.entries(cards)) {
      const { record, dropped } = sanitise(raw, { teamId, judgeUid, adminUid });
      dropped.forEach((field) => droppedFields.add(field));

      const found = validate(record);
      if (found.length) {
        problems.push(`  ${team?.name ?? teamId} / judge ${judgeUid} (${round}): ${found.join("; ")}`);
        continue;
      }

      updates[`scores/${round}/${teamId}/${judgeUid}`] = record;
      counts[round] += 1;
    }

    updates[`teams/${teamId}/${key}`] = null;
  }
}

// ------------------------------------------------- final round backfill --

// The final round used to be driven entirely off /finalRound, which judges and
// teams could read. They cannot any more, so the copies they read instead have
// to exist before the new build is any use to them.
let backfilledSlots = 0;
let backfilledJudges = 0;

if (Object.keys(finalists).length) {
  for (const [teamId, details] of Object.entries(finalists)) {
    if (!details?.room || !details?.timeslot) continue;
    updates[`teams/${teamId}/finalSlot`] = { room: details.room, timeslot: details.timeslot };
    backfilledSlots += 1;
  }

  for (const judgeUid of Object.keys(judges)) {
    const assignments = {};
    for (const [teamId, details] of Object.entries(finalists)) {
      if (details?.excludedJudges?.[judgeUid]) continue;
      if (!details?.room || !details?.timeslot) continue;
      assignments[teamId] = {
        teamId,
        teamName: details.name ?? "Unnamed Team",
        room: details.room,
        timeslot: details.timeslot,
      };
    }
    if (Object.keys(assignments).length) {
      updates[`judges/${judgeUid}/finalAssignments`] = assignments;
      backfilledJudges += 1;
    }
  }
}

// ------------------------------------------------------------- reporting --

// hasChild() cannot see into an array, and the new score rules prove an
// assignment with it. Any judge still holding an array shape simply cannot
// score until the schedule is regenerated.
const arrayShaped = Object.entries(judges)
  .filter(([, judge]) => Array.isArray(judge?.teamAssignments))
  .map(([uid, judge]) => `${[judge?.firstName, judge?.lastName].filter(Boolean).join(" ") || uid} [${uid}]`);

console.log(`Scores to move: ${counts.first} first round, ${counts.final} final round.`);
if (backfilledSlots || backfilledJudges) {
  console.log(
    `Final round backfill: ${backfilledSlots} team slot(s), ${backfilledJudges} judge assignment list(s).`
  );
}
if (droppedFields.size) {
  console.log(`Unknown fields dropped (the rules reject them): ${[...droppedFields].join(", ")}`);
}
if (arrayShaped.length) {
  console.log(
    `\nWARNING: ${arrayShaped.length} judge(s) hold array-shaped teamAssignments and will be\n` +
      `unable to submit any score until you press Generate Schedule once:\n  ${arrayShaped.join("\n  ")}`
  );
}
if (problems.length) {
  console.log(`\n${problems.length} record(s) WILL NOT MIGRATE and are left where they are:`);
  console.log(problems.join("\n"));
  console.log(
    "\nThese are excluded rather than aborting the run. Fix them in the console if they matter."
  );
}

if (counts.first + counts.final === 0 && !backfilledSlots) {
  console.log("\nNothing to migrate.");
  process.exit(0);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write these changes.");
  process.exit(0);
}

mkdirSync(BACKUP_DIR, { recursive: true });
const backupPath = join(BACKUP_DIR, `scores-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backupPath, JSON.stringify({ legacy: legacyBackup, finalists }, null, 2));
console.log(`\nBacked up the legacy nodes to ${backupPath}`);

// One atomic update: the copy and the null-out land together, so there is no
// instant in which a score exists in neither place.
await update(ref(database), updates);

console.log(`Migrated ${counts.first + counts.final} score(s).`);
console.log("Now publish database.rules.json, and press Generate Schedule once.");
process.exit(0);
