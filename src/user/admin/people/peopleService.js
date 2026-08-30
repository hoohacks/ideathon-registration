import { ref, get, push, serverTimestamp } from "firebase/database";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  connectAuthEmulator,
} from "firebase/auth";
import { database, auth, USING_EMULATOR } from "../../../firebase.js";
import { firebaseConfig } from "../../../firebaseConfig.js";
import { applyAdminAction } from "../adminAction.js";
import { grantAdmin, revokeAdmin, revokeGuard } from "../organisers/adminsService.js";

/**
 * Everything about a person that used to need the Firebase console.
 *
 * A role in this app is membership of a node named after it -- /admins/{uid},
 * /judges/{uid}, /competitors/{uid} -- and they are additive: one account can
 * be all three. Until now only /admins was reachable from the app, so making
 * someone a judge after they registered as a competitor meant opening the
 * console and hand-writing a record.
 *
 * Two limits are real and cannot be engineered away from a browser, so they are
 * surfaced rather than hidden:
 *
 *   - **The client SDK cannot delete a Firebase Auth account**, and cannot list
 *     them either. Deleting someone here removes their database records and
 *     leaves a working login that resolves to no role. That person can still
 *     sign in and will see an empty account.
 *   - **It cannot change someone's email or password.** A password reset is
 *     sent as an email to them; nobody here can set it directly.
 *
 * Creating an account IS possible, via a second Firebase app instance. Calling
 * createUserWithEmailAndPassword on the main one would sign the organiser out
 * and in as the person they just created, which is a memorable way to lose a
 * schedule generation halfway through.
 */

export const ROLE_NODES = { admin: "admins", judge: "judges", competitor: "competitors" };

/** A judge record with nothing filled in but the fields the app reads. */
export function blankJudge({ firstName = "", lastName = "", email = "", company = "" } = {}) {
  return {
    firstName, lastName, email, company,
    withCompany: Boolean(company),
    wantsToJudge: true,
    wantsToMentor: false,
    skills: [],
    timeslots: [],
    checkedIn: false,
    foodCheckIn: false,
    isRound1Judge: false,
    registeredAt: serverTimestamp(),
  };
}

/** A competitor record, same idea. */
export function blankCompetitor({ firstName = "", lastName = "", email = "" } = {}) {
  return {
    firstName, lastName, email,
    major: "",
    skills: "",
    learn: "",
    gender: "",
    schoolYear: "",
    uvaSchool: "",
    resume: "",
    dietaryRestriction: "None",
    checkedIn: false,
    foodCheckIn: false,
    registeredAt: serverTimestamp(),
  };
}

/**
 * Everyone, with the roles they hold.
 *
 * /admins holds only `true`, so an admin who is neither judge nor competitor
 * has no name anywhere. They still have to be listed, or the one person you
 * most need to find -- the organiser you are about to revoke -- is invisible.
 */
export async function listPeople() {
  const [adminsSnap, judgesSnap, competitorsSnap] = await Promise.all([
    get(ref(database, "admins")),
    get(ref(database, "judges")),
    get(ref(database, "competitors")),
  ]);

  const people = new Map();
  const touch = (uid) => {
    if (!people.has(uid)) {
      people.set(uid, { uid, name: "", email: "", roles: [], judge: null, competitor: null });
    }
    return people.get(uid);
  };

  for (const uid of Object.keys(adminsSnap.val() ?? {})) touch(uid).roles.push("admin");

  for (const [role, snap] of [["judge", judgesSnap], ["competitor", competitorsSnap]]) {
    for (const [uid, person] of Object.entries(snap.val() ?? {})) {
      const entry = touch(uid);
      entry.roles.push(role);
      entry[role] = person;
      const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
      if (name && !entry.name) entry.name = name;
      if (person?.email && !entry.email) entry.email = person.email;
    }
  }

  return [...people.values()]
    .map((p) => ({ ...p, name: p.name || p.email || `(no profile) ${p.uid.slice(0, 8)}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesQuery(person, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return (
    person.name.toLowerCase().includes(needle) ||
    String(person.email).toLowerCase().includes(needle) ||
    person.uid.toLowerCase().includes(needle)
  );
}

/**
 * Every path that mentions this person, so removing them does not leave a name
 * on a schedule card nobody can explain. Pure, so the fan-out can be tested.
 */
export function removalChanges({
  uid,
  judgesData = {},
  teamsData = {},
  competitorsData = {},
  scoresData = {},
  finalRoundTeams = {},
  includeScores = false,
}) {
  const changes = [];

  if (judgesData[uid]) changes.push({ path: `judges/${uid}`, before: judgesData[uid], after: null });
  if (competitorsData[uid]) {
    changes.push({ path: `competitors/${uid}`, before: competitorsData[uid], after: null });
  }

  for (const [teamId, team] of Object.entries(teamsData)) {
    // a competitor leaves their team's roster
    if (team?.members && Object.prototype.hasOwnProperty.call(team.members, uid)) {
      changes.push({ path: `teams/${teamId}/members/${uid}`, before: team.members[uid], after: null });
    }

    // a judge comes off every team's schedule card
    const raw = team?.schedule?.judges;
    const roster = Array.isArray(raw) ? raw : Object.values(raw ?? {});
    if (roster.some((entry) => entry?.judgeId === uid)) {
      changes.push({
        path: `teams/${teamId}/schedule/judges`,
        before: roster,
        after: roster.filter((entry) => entry?.judgeId !== uid),
      });
    }

  }

  // and out of the final round exclusion list, or a deleted judge keeps a
  // finalist permanently unjudgeable
  for (const [teamId, standing] of Object.entries(finalRoundTeams ?? {})) {
    if (standing?.excludedJudges?.[uid]) {
      changes.push({
        path: `finalRound/teams/${teamId}/excludedJudges/${uid}`,
        before: standing.excludedJudges[uid],
        after: null,
      });
    }
  }

  if (includeScores) {
    for (const [round, teams] of Object.entries(scoresData ?? {})) {
      for (const [teamId, cards] of Object.entries(teams ?? {})) {
        if (cards?.[uid]) {
          changes.push({ path: `scores/${round}/${teamId}/${uid}`, before: cards[uid], after: null });
        }
      }
    }
  }

  return changes;
}

async function loadWorld() {
  const [judgesSnap, teamsSnap, competitorsSnap, scoresSnap, finalSnap] = await Promise.all([
    get(ref(database, "judges")),
    get(ref(database, "teams")),
    get(ref(database, "competitors")),
    get(ref(database, "scores")),
    get(ref(database, "finalRound/teams")),
  ]);
  return {
    judgesData: judgesSnap.val() ?? {},
    teamsData: teamsSnap.val() ?? {},
    competitorsData: competitorsSnap.val() ?? {},
    scoresData: scoresSnap.val() ?? {},
    finalRoundTeams: finalSnap.val() ?? {},
  };
}

/**
 * Give or take away one role.
 *
 * Granting judge or competitor writes a blank profile if there is not one
 * already; revoking deletes the record and everything that referenced it. The
 * admin role is only a flag, so it goes through the existing lockout guard.
 */
export async function setRole({ uid, name, role, enabled, includeScores = false }) {
  if (!ROLE_NODES[role]) return { ok: false, error: `Unknown role "${role}".` };
  if (!uid) return { ok: false, error: "Pick a person first." };

  if (role === "admin") {
    // delegates rather than reimplements: revokeAdmin carries the lockout guard
    // that stops /admins being emptied, which cannot be undone from inside the
    // app because writing /admins requires already being an admin
    return enabled ? grantAdmin({ uid, name }) : revokeAdmin(uid, { name });
  }

  const world = await loadWorld();
  const node = ROLE_NODES[role];
  const existing = role === "judge" ? world.judgesData[uid] : world.competitorsData[uid];

  if (enabled) {
    if (existing) return { ok: false, error: `${name || uid} is already a ${role}.` };
    const blank = role === "judge" ? blankJudge({}) : blankCompetitor({});
    return applyAdminAction({
      action: "role.grant",
      summary: `Made ${name || uid} a ${role}`,
      changes: [{ path: `${node}/${uid}`, before: null, after: blank }],
    });
  }

  if (!existing) return { ok: false, error: `${name || uid} is not a ${role}.` };

  // only the paths belonging to THIS role, so revoking judge does not delete a
  // competitor record for the same person
  const all = removalChanges({ uid, ...world, includeScores });
  const changes = all.filter((change) =>
    role === "judge"
      ? change.path.startsWith("judges/") ||
        change.path.includes("/schedule/judges") ||
        change.path.startsWith("scores/") ||
        change.path.includes("/excludedJudges/")
      : change.path.startsWith("competitors/") || change.path.includes("/members/")
  );

  return applyAdminAction({
    action: "role.revoke",
    summary: `Removed the ${role} record for ${name || uid}`,
    changes,
  });
}

/**
 * Remove a person entirely: every role, every reference.
 *
 * Their login survives. Nothing in a browser can delete a Firebase Auth
 * account, so the honest thing is to do the half that is possible and say so.
 */
export async function deletePerson({ uid, name, includeScores = false }) {
  if (!uid) return { ok: false, error: "Pick a person first." };
  if (uid === auth.currentUser?.uid) {
    return { ok: false, error: "You cannot delete your own records while signed in as them." };
  }

  const world = await loadWorld();
  const adminsSnap = await get(ref(database, "admins"));
  const adminUids = Object.keys(adminsSnap.val() ?? {});

  if (adminUids.includes(uid)) {
    const refusal = revokeGuard({ uid, currentUid: auth.currentUser?.uid ?? null, adminUids });
    if (refusal) return { ok: false, error: refusal };
  }

  const changes = removalChanges({ uid, ...world, includeScores });
  if (adminUids.includes(uid)) {
    changes.push({ path: `admins/${uid}`, before: true, after: null });
  }

  if (!changes.length) return { ok: false, error: "There is nothing recorded for that person." };

  const result = await applyAdminAction({
    action: "person.delete",
    summary: `Deleted every record for ${name || uid}`,
    changes,
  });

  return {
    ...result,
    warning:
      "Their login still works. A browser cannot delete a Firebase Auth account, so they can " +
      "sign in and will see an account with no role. Remove the account in the Firebase console " +
      "if that matters.",
  };
}

/**
 * Create an account and its record.
 *
 * The account is created on a SECOND Firebase app, because
 * createUserWithEmailAndPassword signs the new user in on whichever app it is
 * called against -- doing that on the main one would sign the organiser out
 * mid-task and leave them acting as the person they just created.
 */
export async function createPerson({ role, firstName, lastName, email, password, company = "" }) {
  if (!ROLE_NODES[role] || role === "admin") {
    return { ok: false, error: "Create a judge or a competitor; organiser is a flag on top." };
  }
  if (!String(email ?? "").includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (String(password ?? "").length < 6) {
    return { ok: false, error: "The password must be at least 6 characters." };
  }

  let secondary;
  let uid;
  try {
    secondary = initializeApp(firebaseConfig, `admin-create-${Date.now()}`);
    const secondaryAuth = getAuth(secondary);
    if (USING_EMULATOR) {
      const host = process.env.REACT_APP_EMULATOR_HOST || "127.0.0.1";
      connectAuthEmulator(secondaryAuth, `http://${host}:9099`, { disableWarnings: true });
    }

    const credential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    uid = credential.user.uid;
    await signOut(secondaryAuth);
  } catch (error) {
    const message =
      error?.code === "auth/email-already-in-use"
        ? "That email already has an account. Search for them instead and add the role."
        : error?.message || "The account could not be created.";
    return { ok: false, error: message };
  } finally {
    if (secondary) {
      try { await deleteApp(secondary); } catch { /* already gone */ }
    }
  }

  const record =
    role === "judge"
      ? blankJudge({ firstName, lastName, email: email.trim(), company })
      : blankCompetitor({ firstName, lastName, email: email.trim() });

  const result = await applyAdminAction({
    action: "person.create",
    summary: `Created ${role} ${[firstName, lastName].filter(Boolean).join(" ") || email}`,
    changes: [{ path: `${ROLE_NODES[role]}/${uid}`, before: null, after: record }],
  });

  return { ...result, uid };
}

/** Create a database record for a uid that already has a login. */
export async function attachRecord({ uid, role, firstName, lastName, email, company = "" }) {
  if (!uid) return { ok: false, error: "Enter the account's uid." };
  if (!ROLE_NODES[role] || role === "admin") {
    return { ok: false, error: "Pick judge or competitor." };
  }

  const snap = await get(ref(database, `${ROLE_NODES[role]}/${uid}`));
  if (snap.exists()) return { ok: false, error: `That uid already has a ${role} record.` };

  const record =
    role === "judge"
      ? blankJudge({ firstName, lastName, email, company })
      : blankCompetitor({ firstName, lastName, email });

  return applyAdminAction({
    action: "person.create",
    summary: `Added a ${role} record for ${[firstName, lastName].filter(Boolean).join(" ") || uid}`,
    changes: [{ path: `${ROLE_NODES[role]}/${uid}`, before: null, after: record }],
  });
}

/** Email a reset link. The only password operation a browser is allowed. */
export async function sendReset(email) {
  if (!String(email ?? "").includes("@")) return { ok: false, error: "That person has no email on file." };
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "The reset email could not be sent." };
  }
}

/**
 * Set one boolean on many people at once.
 *
 * Check-in for a whole company's judges, or marking the round-one pool, is
 * otherwise one dialog per person -- which is how a room of forty judges gets
 * half checked in.
 */
export async function bulkSet({ uids, role, field, value }) {
  const allowed = {
    judge: ["checkedIn", "foodCheckIn", "isRound1Judge"],
    competitor: ["checkedIn", "foodCheckIn"],
  };
  if (!allowed[role]?.includes(field)) {
    return { ok: false, error: `Cannot set ${field} on a ${role}.` };
  }
  if (!uids?.length) return { ok: false, error: "Nobody is selected." };

  const node = ROLE_NODES[role];
  const before = await Promise.all(
    uids.map(async (uid) => {
      const snap = await get(ref(database, `${node}/${uid}/${field}`));
      return snap.exists() ? snap.val() : null;
    })
  );

  const changes = uids
    .map((uid, i) => ({ path: `${node}/${uid}/${field}`, before: before[i], after: value }))
    .filter((change) => change.before !== change.after);

  if (!changes.length) return { ok: false, error: "They are all already set that way." };

  return applyAdminAction({
    action: "people.bulk",
    summary: `Set ${field} to ${value} for ${changes.length} ${role}(s)`,
    changes,
  });
}

/** Create a team with no members, so walk-ins have somewhere to go. */
export async function createTeam(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return { ok: false, error: "Give the team a name." };

  const teamId = push(ref(database, "teams")).key;
  return applyAdminAction({
    action: "team.create",
    summary: `Created the team ${trimmed}`,
    changes: [
      {
        path: `teams/${teamId}`,
        before: null,
        after: { name: trimmed, createdBy: auth.currentUser?.uid ?? "admin", submitted: false },
      },
    ],
  });
}

/** Delete a team, detaching its members rather than orphaning their teamId. */
export async function deleteTeam({ teamId, teamName }) {
  const [teamSnap, competitorsSnap, judgesSnap] = await Promise.all([
    get(ref(database, `teams/${teamId}`)),
    get(ref(database, "competitors")),
    get(ref(database, "judges")),
  ]);
  if (!teamSnap.exists()) return { ok: false, error: "That team no longer exists." };

  const team = teamSnap.val();
  const changes = [{ path: `teams/${teamId}`, before: team, after: null }];

  for (const [uid, person] of Object.entries(competitorsSnap.val() ?? {})) {
    if (person?.teamId === teamId) {
      changes.push({ path: `competitors/${uid}/teamId`, before: teamId, after: null });
    }
  }

  // every judge holds a copy of the assignment, because they cannot read /teams
  for (const [uid, judge] of Object.entries(judgesSnap.val() ?? {})) {
    if (judge?.teamAssignments?.[teamId]) {
      changes.push({
        path: `judges/${uid}/teamAssignments/${teamId}`,
        before: judge.teamAssignments[teamId],
        after: null,
      });
    }
    if (judge?.finalAssignments?.[teamId]) {
      changes.push({
        path: `judges/${uid}/finalAssignments/${teamId}`,
        before: judge.finalAssignments[teamId],
        after: null,
      });
    }
  }

  return applyAdminAction({
    action: "team.delete",
    summary: `Deleted the team ${teamName || teamId}`,
    changes,
  });
}

/** Write any config key, for the settings that have no dedicated control. */
export async function setConfigValue(key, value) {
  const trimmed = String(key ?? "").trim();
  if (!trimmed || trimmed.includes("/")) {
    return { ok: false, error: "Give a single config key, with no slashes." };
  }

  const snap = await get(ref(database, `config/${trimmed}`));
  return applyAdminAction({
    action: "config.set",
    summary: `Set config/${trimmed}`,
    changes: [{ path: `config/${trimmed}`, before: snap.exists() ? snap.val() : null, after: value }],
  });
}
