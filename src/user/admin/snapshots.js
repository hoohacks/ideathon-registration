import { ref, get, update, push, onValue, serverTimestamp } from "firebase/database";
import { database } from "../../firebase.js";
import { requireAdmin } from "../../roles.js";
import { resolveName } from "./adminAction.js";

/**
 * Restore points for the operations the audit log cannot carry.
 *
 * `applyAdminAction` records a before-state inline in the log entry, which is
 * right for a field edit and wrong for anything bulk: past UNDO_SIZE_CAP it
 * drops the before-state entirely and marks the entry un-undoable. That made
 * recoverability depend on data size -- "clear the schedule and every score"
 * was reversible on a 20-team test event and unreversible on the 30-team event
 * it was rehearsed for. The safety net was present exactly where it was not
 * needed.
 *
 * A snapshot is stored out of line instead, so size stops being the thing that
 * decides whether a mistake can be undone.
 *
 * Two nodes, on purpose:
 *
 *   /snapshotIndex/{id}   small metadata, cheap to list
 *   /snapshots/{id}       the payload, only ever read when restoring
 *
 * Listing restore points would otherwise mean downloading every one of them.
 *
 * Both live under the root admin rule and neither has a .validate clause, so
 * this needs no rules change and no republish.
 */

/** How many restore points to keep. Older ones are pruned as new ones arrive. */
export const KEEP_SNAPSHOTS = 15;

/** Everything the judging round consists of. The default for a bulk action. */
export const JUDGING_PATHS = ["teams", "judges", "scores", "finalRound", "config/scheduleMeta"];

function encode(value) {
  // JSON strings for the same reason adminLog uses them: Realtime Database
  // drops nulls on write, so a literal null -- meaning "this did not exist" --
  // would vanish and a restore would put back the wrong thing.
  return JSON.stringify(value ?? null);
}

/**
 * Copy the current value of every path into a restore point.
 *
 * Returns `{ ok, id, bytes }`. The caller must treat `ok: false` as a reason to
 * abandon the destructive action it was about to take -- a wipe with no restore
 * point is the situation this module exists to prevent.
 */
export async function captureSnapshot({ label, reason = null, paths = JUDGING_PATHS }) {
  let admin;
  try {
    admin = await requireAdmin("create a restore point");
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    const entries = await Promise.all(
      paths.map(async (path) => {
        const snap = await get(ref(database, path));
        return { path, value: encode(snap.exists() ? snap.val() : null) };
      })
    );

    const bytes = entries.reduce((sum, entry) => sum + entry.value.length, 0);
    const id = push(ref(database, "snapshots")).key;

    const updates = {
      [`snapshots/${id}`]: { entries },
      [`snapshotIndex/${id}`]: {
        at: serverTimestamp(),
        by: admin.uid,
        byName: await resolveName(admin.uid),
        label,
        reason,
        paths,
        bytes,
      },
    };

    // prune in the same update, so the store cannot grow without bound and a
    // failed prune cannot leave an orphaned payload behind
    const indexSnap = await get(ref(database, "snapshotIndex"));
    if (indexSnap.exists()) {
      const existing = Object.entries(indexSnap.val() ?? {})
        .map(([key, meta]) => ({ key, at: meta?.at ?? 0 }))
        .sort((a, b) => b.at - a.at);
      for (const stale of existing.slice(KEEP_SNAPSHOTS - 1)) {
        updates[`snapshots/${stale.key}`] = null;
        updates[`snapshotIndex/${stale.key}`] = null;
      }
    }

    await update(ref(database), updates);
    return { ok: true, id, bytes };
  } catch (error) {
    console.error("Could not create a restore point:", error);
    return { ok: false, error: error.message || "The restore point could not be saved." };
  }
}

/**
 * Live metadata for every restore point, newest first.
 *
 * A subscription rather than a one-shot read, because restore points are
 * created by other parts of the panel -- generating a schedule, clearing it,
 * activating the final round. With a one-shot read the list a person is looking
 * at is stale the moment the thing they might need to undo happens, which is
 * the worst possible moment for it to be stale.
 */
export function subscribeToSnapshots(callback) {
  const stop = onValue(
    ref(database, "snapshotIndex"),
    (snap) => {
      const value = snap.val() ?? {};
      callback(
        Object.entries(value)
          .map(([id, meta]) => ({ id, ...meta }))
          .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      );
    },
    (error) => {
      console.error("Could not watch restore points:", error);
      callback([]);
    }
  );
  return () => stop();
}

/** Metadata for every restore point, newest first. Never loads a payload. */
export async function listSnapshots() {
  try {
    const snap = await get(ref(database, "snapshotIndex"));
    if (!snap.exists()) return [];
    return Object.entries(snap.val() ?? {})
      .map(([id, meta]) => ({ id, ...meta }))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  } catch (error) {
    console.error("Could not list restore points:", error);
    return [];
  }
}

/**
 * Put every path in a restore point back to the value it held.
 *
 * Takes a restore point of the CURRENT state first, so restoring is itself
 * reversible -- an organizer who restores the wrong one has somewhere to go.
 * The whole thing is one atomic update, so a restore cannot half-apply.
 */
export async function restoreSnapshot(id) {
  let admin;
  try {
    admin = await requireAdmin("restore from a restore point");
  } catch (error) {
    return { ok: false, error: error.message };
  }

  let payload;
  let meta;
  try {
    const [payloadSnap, metaSnap] = await Promise.all([
      get(ref(database, `snapshots/${id}`)),
      get(ref(database, `snapshotIndex/${id}`)),
    ]);
    if (!payloadSnap.exists()) return { ok: false, error: "That restore point no longer exists." };
    payload = payloadSnap.val();
    meta = metaSnap.exists() ? metaSnap.val() : {};
  } catch (error) {
    return { ok: false, error: error.message || "Could not read that restore point." };
  }

  const entries = Array.isArray(payload?.entries)
    ? payload.entries
    : Object.values(payload?.entries ?? {});
  if (!entries.length) return { ok: false, error: "That restore point is empty." };

  const safety = await captureSnapshot({
    label: `Before restoring “${meta.label ?? id}”`,
    reason: "taken automatically so a restore can itself be undone",
    paths: entries.map((entry) => entry.path),
  });
  if (!safety.ok) {
    return {
      ok: false,
      error: `Could not take a restore point of the current state, so nothing was restored. ${safety.error}`,
    };
  }

  try {
    const updates = {};
    for (const entry of entries) {
      updates[entry.path] = JSON.parse(entry.value ?? "null");
    }

    // the log entry rides along in the same update. Its changes are omitted on
    // purpose: they are what the restore point is for, and inlining them is the
    // exact failure this module exists to fix.
    const entryId = push(ref(database, "adminLog")).key;
    updates[`adminLog/${entryId}`] = {
      at: serverTimestamp(),
      by: admin.uid,
      byName: await resolveName(admin.uid),
      action: "snapshot.restore",
      summary:
        `Restored ${entries.length} path(s) from “${meta.label ?? id}”. ` +
        `The previous state was saved as a new restore point first.`,
      undoable: false,
    };

    await update(ref(database), updates);
    return { ok: true, restored: entries.length, safetyId: safety.id };
  } catch (error) {
    console.error("Restore failed:", error);
    return {
      ok: false,
      error: error.message || "The restore could not be applied. Nothing was changed.",
    };
  }
}

/**
 * Take a restore point, and refuse to continue if it could not be taken.
 *
 * Every destructive bulk action funnels through this, so "we wiped it and there
 * is no copy" stops being a reachable state.
 */
export async function guardWith({ label, reason, paths = JUDGING_PATHS }) {
  const snapshot = await captureSnapshot({ label, reason, paths });
  if (!snapshot.ok) {
    return {
      ok: false,
      error:
        `Could not create a restore point, so nothing was changed. ${snapshot.error ?? ""}`.trim(),
    };
  }
  return { ok: true, snapshotId: snapshot.id, bytes: snapshot.bytes };
}
