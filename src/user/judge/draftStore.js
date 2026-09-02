import { ref, get, update, onValue, serverTimestamp } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";
import { requireAdmin } from "../../roles.js";
import { resolveName } from "../admin/adminAction.js";

/**
 * Persistence for a schedule preview an organizer is still hand-editing.
 *
 * Building a schedule and then reworking room and judge assignments by hand
 * can take ten minutes. Without somewhere to put the in-progress plan, a
 * closed laptop lid or a stray reload threw all of it away. `/scheduleDraft`
 * is a single top-level node that holds exactly one draft at a time -- the
 * one currently open in the preview.
 *
 * `/scheduleDraft` gets no entry in database.rules.json, on purpose. It
 * inherits the root rule's admin-only .read/.write, same as every other path
 * nobody has written a narrower rule for. A rule scoped to this path could
 * only ever be equal or looser than that, and the unpublished schedule --
 * who is judging which team, before it is announced -- is exactly the kind
 * of thing that must not leak to a signed-in judge or competitor. So: no
 * rule, no republish, and reviewers should not add one here.
 *
 * `edits` is the one field that changes shape crossing the wire. In memory
 * (planSchedule.js, applyEdit.js) it is an ordered array. Realtime Database
 * never stores an array -- this codebase's rule is that sets are keyed, so a
 * single entry can be addressed and deleted without renumbering the rest.
 * `saveDraft` keys it on the way out with zero-padded indices ("0000",
 * "0001", ...), and `readDraft`/`subscribeDraft` sort those keys back into
 * the array `applyEdit` expects. `schedule.judges` inside each assignment is
 * the one array this codebase does keep, because it is the same shape
 * already written to teams/{id}/schedule.
 *
 * `saveDraft` is optimistic-concurrency: two organizers can have the preview
 * open at once, and the second save should not silently clobber the first.
 * It reads the stored version, refuses if it does not match the version the
 * caller last read, and names who moved it.
 */

const DRAFT_PATH = "scheduleDraft";

/** Array -> keyed object, zero-padded wide enough for string sort to equal numeric order. */
function encodeEdits(edits) {
  const list = Array.isArray(edits) ? edits : [];
  const width = Math.max(4, String(list.length).length);
  const keyed = {};
  list.forEach((entry, index) => {
    keyed[String(index).padStart(width, "0")] = entry;
  });
  return keyed;
}

/** Keyed object -> array, in key order. Tolerates an array already, just in case. */
function decodeEdits(stored) {
  if (Array.isArray(stored)) return stored;
  if (!stored || typeof stored !== "object") return [];
  return Object.keys(stored)
    .sort()
    .map((key) => stored[key]);
}

function decodeDraft(raw) {
  if (!raw) return null;
  return { ...raw, edits: decodeEdits(raw.edits) };
}

/**
 * The current draft, or null if nobody has saved one (or it was cleared).
 * Never throws -- a read failure is reported the same way as "no draft yet",
 * since callers use this to decide whether to offer "resume your draft".
 */
export async function readDraft() {
  try {
    const snap = await get(ref(database, DRAFT_PATH));
    return snap.exists() ? decodeDraft(snap.val()) : null;
  } catch (error) {
    console.error("Could not read the schedule draft:", error);
    return null;
  }
}

/**
 * Save a plan as the draft, refusing a stale write.
 *
 * Returns { ok, error?, version? }. On success `version` is the value now
 * stored, one higher than the plan the caller had -- the caller should hold
 * onto it so its next save is checked against what it actually wrote.
 */
export async function saveDraft(plan) {
  try {
    await requireAdmin("save the schedule draft");
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    const snap = await get(ref(database, DRAFT_PATH));
    const stored = snap.exists() ? snap.val() : null;

    if (stored && stored.version !== plan.version) {
      return {
        ok: false,
        error:
          `${stored.createdByName ?? "Another organizer"} changed this draft while you were ` +
          `looking. Reload the preview to pick up their version.`,
      };
    }

    const nextVersion = (plan.version ?? 0) + 1;

    // uid comes from the auth SDK directly rather than requireAdmin's return
    // value: requireAdmin's job here is the guard (throw if not an admin),
    // not to be the source of truth for who is acting.
    const uid = getAuth().currentUser?.uid;

    const stamp = stored
      ? {
          createdAt: stored.createdAt,
          createdBy: stored.createdBy,
          createdByName: stored.createdByName,
        }
      : {
          createdAt: serverTimestamp(),
          createdBy: uid,
          createdByName: await resolveName(uid),
        };

    const { edits, ...rest } = plan;

    const payload = {
      ...rest,
      edits: encodeEdits(edits),
      ...stamp,
      version: nextVersion,
    };

    await update(ref(database), { [DRAFT_PATH]: payload });
    return { ok: true, version: nextVersion };
  } catch (error) {
    console.error("Could not save the schedule draft:", error);
    return { ok: false, error: error.message || "The draft could not be saved." };
  }
}

/** Discard the draft. Only ever called once the schedule is published or abandoned. */
export async function clearDraft() {
  try {
    await requireAdmin("clear the schedule draft");
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    await update(ref(database), { [DRAFT_PATH]: null });
    return { ok: true };
  } catch (error) {
    console.error("Could not clear the schedule draft:", error);
    return { ok: false, error: error.message || "The draft could not be cleared." };
  }
}

/**
 * Live updates to the draft, decoded the same way `readDraft` decodes it.
 * Mirrors `subscribeToSnapshots` in ../admin/snapshots.js: hands the callback
 * a plain value (here, the plan or null) rather than a snapshot, and returns
 * an unsubscribe function.
 */
export function subscribeDraft(callback) {
  const stop = onValue(
    ref(database, DRAFT_PATH),
    (snap) => {
      callback(snap.exists() ? decodeDraft(snap.val()) : null);
    },
    (error) => {
      console.error("Could not watch the schedule draft:", error);
      callback(null);
    }
  );
  return () => stop();
}
