import { ref, get } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";
import { applyAdminAction } from "./adminAction.js";

/**
 * Who is an organiser.
 *
 * The rules give root access only to uids under /admins, and writing to
 * /admins requires being an admin already. Nothing in the app can break that
 * cycle -- the README bootstraps the first one by hand in the Firebase console.
 *
 * So a revoke that empties /admins locks everyone out permanently, with no way
 * back except the console. revokeGuard is the whole reason this module exists,
 * and it is enforced here rather than in the dialog so a stale page cannot slip
 * past it.
 */

/** The reason this revoke must not happen, or null if it may. Pure. */
export function revokeGuard({ uid, currentUid, adminUids }) {
  if (!adminUids.includes(uid)) {
    return "That person is not an organiser.";
  }
  if (adminUids.length <= 1) {
    return (
      "That is the last organiser. Removing them would lock everyone out -- " +
      "/admins can only be written by an admin, so nothing in the app could add one back. " +
      "Grant someone else first."
    );
  }
  if (uid === currentUid) {
    return "You cannot remove your own organiser access. Ask another organiser to do it.";
  }
  return null;
}

export async function listAdmins() {
  const snap = await get(ref(database, "admins"));
  return snap.exists() ? Object.keys(snap.val() ?? {}) : [];
}

/**
 * Find a person to promote. Granting takes someone picked from the roster
 * rather than a pasted uid, because a typo in a uid creates an admin entry that
 * belongs to nobody -- it can never be used, and worse, it still counts toward
 * the last-organiser check that stops a lockout.
 */
export async function findPeopleByEmail(query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (needle.length < 2) return [];

  const [judgesSnap, competitorsSnap] = await Promise.all([
    get(ref(database, "judges")),
    get(ref(database, "competitors")),
  ]);

  const found = new Map();
  for (const [role, snap] of [["judge", judgesSnap], ["competitor", competitorsSnap]]) {
    for (const [uid, person] of Object.entries(snap.exists() ? snap.val() ?? {} : {})) {
      const email = String(person?.email ?? "");
      const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
      if (!email.toLowerCase().includes(needle) && !name.toLowerCase().includes(needle)) continue;

      const existing = found.get(uid);
      found.set(uid, {
        uid,
        name: name || email || uid,
        email,
        roles: [...(existing?.roles ?? []), role],
      });
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function grantAdmin({ uid, name }) {
  if (!uid) return { ok: false, error: "Pick a person first." };

  const adminUids = await listAdmins();
  if (adminUids.includes(uid)) {
    return { ok: false, error: `${name || uid} is already an organiser.` };
  }

  return applyAdminAction({
    action: "admin.grant",
    summary: `Made ${name || uid} an organiser`,
    changes: [{ path: `admins/${uid}`, before: null, after: true }],
  });
}

export async function revokeAdmin(uid, { name } = {}) {
  const adminUids = await listAdmins();
  const currentUid = getAuth().currentUser?.uid ?? null;

  const refusal = revokeGuard({ uid, currentUid, adminUids });
  if (refusal) return { ok: false, error: refusal };

  return applyAdminAction({
    action: "admin.revoke",
    summary: `Removed organiser access from ${name || uid}`,
    changes: [{ path: `admins/${uid}`, before: true, after: null }],
  });
}
