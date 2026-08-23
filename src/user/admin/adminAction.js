import { ref, get, update, push, serverTimestamp } from "firebase/database";
import { database } from "../../firebase.js";
import { requireAdmin } from "../../roles.js";

/**
 * Every write the control panel makes goes through here.
 *
 * The one property worth protecting: the change and the entry describing it go
 * into the SAME multi-path update, which Realtime Database applies atomically.
 * Two separate writes would let a change land with no record on a dropped
 * connection -- precisely the state you would be trying to explain afterwards.
 *
 * This is a forensics aid, not a ledger. Admins hold root write and deletes
 * skip validation, so entries can be erased. It answers "what did we change at
 * 4:52", not "prove nobody tampered".
 */

/**
 * Above this many bytes of serialised before/after, the entry keeps counts
 * only. Clearing a whole schedule captures every team's slot plus every
 * judge's copy -- of the order of 100 KB -- and that is not worth storing to
 * make undoable something a regeneration rebuilds anyway.
 */
export const UNDO_SIZE_CAP = 50000;

/**
 * before/after are stored as JSON strings.
 *
 * RTDB drops null values on write, so a literal `before: null` -- meaning the
 * field did not exist -- would silently vanish from the entry and undo would
 * restore the wrong thing. A string survives, and it collapses the .validate
 * for these fields to isString().
 */
export function encodeChanges(changes) {
  return changes.map(({ path, before, after }) => ({
    path,
    before: JSON.stringify(before ?? null),
    after: JSON.stringify(after ?? null),
  }));
}

export function decodeChanges(raw) {
  const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  return list.map(({ path, before, after }) => ({
    path,
    before: JSON.parse(before ?? "null"),
    after: JSON.parse(after ?? "null"),
  }));
}

/** Read the current value at each path, so the entry can carry a before-state. */
export async function captureBefore(paths) {
  const entries = await Promise.all(
    paths.map(async (path) => {
      const snap = await get(ref(database, path));
      return [path, snap.exists() ? snap.val() : null];
    })
  );
  return Object.fromEntries(entries);
}

/** Best-effort display name for the acting admin; the uid is the fallback. */
async function resolveName(uid) {
  for (const role of ["judges", "competitors"]) {
    try {
      const snap = await get(ref(database, `${role}/${uid}`));
      if (snap.exists()) {
        const person = snap.val();
        const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
        if (name) return name;
      }
    } catch {
      // an admin who is neither a judge nor a competitor is normal
    }
  }
  return `admin ${uid.slice(0, 8)}`;
}

export async function applyAdminAction({ action, summary, changes = [], undoable = true }) {
  let admin;
  try {
    admin = await requireAdmin(action);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    const encoded = encodeChanges(changes);
    const tooBig = JSON.stringify(encoded).length > UNDO_SIZE_CAP;

    const entry = {
      at: serverTimestamp(),
      by: admin.uid,
      byName: await resolveName(admin.uid),
      action,
      summary: tooBig ? `${summary} (${changes.length} paths, too large to undo)` : summary,
      undoable: undoable && !tooBig,
    };
    if (!tooBig) entry.changes = encoded;

    const entryId = push(ref(database, "adminLog")).key;

    const updates = {};
    for (const { path, after } of changes) updates[path] = after ?? null;
    updates[`adminLog/${entryId}`] = entry;

    await update(ref(database), updates);
    return { ok: true, entryId };
  } catch (error) {
    console.error(`Admin action ${action} failed:`, error);
    return { ok: false, error: error.message || "The change could not be saved." };
  }
}
