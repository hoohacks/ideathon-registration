/**
 * Drafts of a score card, kept on the judge's device.
 *
 * ScoreSubmission is conditionally mounted, so before this existed the dialog's
 * state died with it: cancel, escape, a stray back gesture, a tab crash or a
 * refresh discarded everything typed, notes included, with no warning. On a
 * venue network that is not a rare event.
 *
 * A draft is per judge, per team, per round, so two judges on a shared tablet
 * cannot inherit each other's half-filled card.
 */
import { readJson, writeJson, removeKey } from "./localStore.js";

const PREFIX = "ideathon:scoreDraft:v1";

function key({ round, teamId, judgeUid }) {
  return `${PREFIX}:${round}:${teamId}:${judgeUid}`;
}

export function saveDraft(target, values) {
  if (!target?.round || !target?.teamId || !target?.judgeUid) return false;
  return writeJson(key(target), { values, savedAt: Date.now() });
}

export function loadDraft(target) {
  if (!target?.round || !target?.teamId || !target?.judgeUid) return null;
  const stored = readJson(key(target));
  if (!stored || typeof stored.values !== "object" || stored.values === null) return null;
  return stored.values;
}

/**
 * Only ever called once the write is confirmed. Clearing on dialog close would
 * defeat the entire point of the draft.
 */
export function clearDraft(target) {
  if (!target?.round || !target?.teamId || !target?.judgeUid) return;
  removeKey(key(target));
}
