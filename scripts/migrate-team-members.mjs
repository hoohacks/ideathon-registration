/**
 * One-off migration: teams/{id}/members from an array to a keyed set.
 *
 *   before   members: ["uidA", "uidB"]     stored under the keys "0", "1"
 *   after    members: { uidA: true, uidB: true }
 *
 * The database rules decide who may read a team and edit its submission with
 * `members.hasChild(auth.uid)`, and that only matches when the uid is the child
 * key. Teams still holding an array are invisible to their own members under
 * the current rules, so run this once after deploying them.
 *
 * Usage (from the repo root):
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-team-members.mjs
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-team-members.mjs --apply
 *
 * Without --apply it only reports what it would change. The account must be
 * present in /admins, since only admins can read and write all of /teams.
 */
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, update } from "firebase/database";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig } from "../src/firebaseConfig.js";

const apply = process.argv.includes("--apply");
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD for an account listed in /admins.");
  process.exit(1);
}

// An array, or an object whose keys are all array indices, is the old shape.
// A keyed set has uids for keys.
function needsMigration(members) {
  if (!members) return false;
  if (Array.isArray(members)) return true;
  if (typeof members !== "object") return false;
  return Object.keys(members).every((key) => /^\d+$/.test(key));
}

function toKeyedSet(members) {
  const uids = (Array.isArray(members) ? members : Object.values(members)).filter(
    (uid) => typeof uid === "string" && uid.length > 0
  );
  return Object.fromEntries(uids.map((uid) => [uid, true]));
}

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

try {
  await signInWithEmailAndPassword(getAuth(app), email, password);
} catch (error) {
  console.error(`Could not sign in: ${error.message}`);
  process.exit(1);
}

const snapshot = await get(ref(database, "teams"));
if (!snapshot.exists()) {
  console.log("No teams found. Nothing to do.");
  process.exit(0);
}

const teams = snapshot.val();
const updates = {};
let alreadyFine = 0;
let empty = 0;

for (const [teamId, team] of Object.entries(teams)) {
  const members = team?.members;

  if (!members) {
    empty += 1;
    continue;
  }
  if (!needsMigration(members)) {
    alreadyFine += 1;
    continue;
  }

  const keyed = toKeyedSet(members);
  updates[`teams/${teamId}/members`] = keyed;
  console.log(
    `  ${team?.name ?? "(unnamed)"} [${teamId}]: ${Object.keys(keyed).length} member(s)`
  );
}

const count = Object.keys(updates).length;
console.log(
  `\n${count} team(s) to migrate, ${alreadyFine} already a keyed set, ${empty} with no members.`
);

if (count === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write these changes.");
  process.exit(0);
}

// one atomic update so a partial migration cannot leave teams half converted
await update(ref(database), updates);
console.log(`\nMigrated ${count} team(s).`);
process.exit(0);
