import { ref, get } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "./firebase.js";

/**
 * A role is membership of a top-level node named after it: /admins/{uid},
 * /judges/{uid}, /competitors/{uid}. Roles are additive — one account can be
 * all three — so this is always a list, never a single value.
 */
export const ROLES = ["competitor", "judge", "admin"];

/**
 * `userTypes` is an array that is empty while the session is still resolving
 * and undefined before the provider mounts. Callers kept re-deriving that
 * contract inline, and two of them had grown their own `Array.isArray` guard,
 * which is the usual sign nobody was sure what they were being handed.
 */
export function hasRole(userTypes, role) {
  return Array.isArray(userTypes) && userTypes.includes(role);
}

/** The roles as a list that is always safe to map over. */
export function roleList(userTypes) {
  return Array.isArray(userTypes) ? userTypes : [];
}

export function isAdmin(userTypes) {
  return hasRole(userTypes, "admin");
}

export function isJudge(userTypes) {
  return hasRole(userTypes, "judge");
}

/**
 * Confirm against the database that the caller is an admin.
 *
 * The React role checks are advisory: `userTypes` is client state, so anyone
 * can set it in DevTools and render an admin page. The rules are what actually
 * stop them. This exists for the handful of service functions that rewrite the
 * whole schedule or the final round — operations destructive enough that
 * failing early with a clear message beats firing a multi-path update and
 * getting a bare PERMISSION_DENIED halfway through.
 *
 * It is a guard rail, not a security boundary. The security boundary is
 * database.rules.json.
 */
export async function requireAdmin(action = "perform this action") {
  const user = getAuth().currentUser;
  if (!user) throw new Error(`Must be signed in to ${action}`);

  const snap = await get(ref(database, `admins/${user.uid}`));
  if (!snap.exists()) throw new Error(`Only an organizer can ${action}`);

  return user;
}
