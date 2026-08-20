/**
 * A durable outbox for score cards that could not reach the database.
 *
 * The Realtime Database SDK buffers writes in memory when it is offline, but
 * `await set(...)` does not resolve until the server acknowledges. So an
 * offline judge previously saw "Submitting…" forever, with no timeout and no
 * way to tell whether the score had landed — and a refresh at that point threw
 * the buffered write away silently. That is a lost score, discovered when the
 * results are tallied and a team is short a judge.
 *
 * Here the write gets a deadline. If it is not acknowledged in time, or fails
 * outright, the card lands in this queue on disk and the judge is told it is
 * saved and will sync. It survives a refresh, a crash, and a flat battery.
 *
 * This module deliberately knows nothing about Firebase: the writer is passed
 * in. That keeps the retry logic testable without a network or an emulator.
 */
import { readJson, writeJson } from "./localStore.js";

const STORAGE_KEY = "ideathon:pendingScores:v1";

/**
 * How long a submit may hang before it is treated as un-acknowledged. Long
 * enough that a slow-but-working venue network still completes inline, short
 * enough that a judge is not staring at a spinner.
 */
export const SUBMIT_TIMEOUT_MS = 8000;

const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a broken listener must not stop the queue draining */
    }
  }
}

export function subscribeToPending(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readAll() {
  const stored = readJson(STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.filter((e) => e && e.teamId && e.round) : [];
}

function writeAll(entries) {
  const ok = writeJson(STORAGE_KEY, entries);
  notify();
  return ok;
}

export function listPending(judgeUid) {
  const all = readAll();
  return judgeUid ? all.filter((entry) => entry.judgeUid === judgeUid) : all;
}

export function pendingCount(judgeUid) {
  return listPending(judgeUid).length;
}

export function hasPendingFor({ round, teamId, judgeUid }) {
  return readAll().some(
    (entry) =>
      entry.round === round && entry.teamId === teamId && entry.judgeUid === judgeUid
  );
}

/**
 * Queue a card. One entry per judge/team/round: re-submitting the same card
 * replaces the queued one rather than stacking a second copy, so a judge who
 * taps submit three times on a dead network syncs one score, not three.
 *
 * Returns false when the device refused storage, which is the one case the
 * caller must surface as a real failure — there is nowhere left to keep it.
 */
export function enqueue({ round, teamId, teamName, judgeUid, score }) {
  const rest = readAll().filter(
    (entry) =>
      !(entry.round === round && entry.teamId === teamId && entry.judgeUid === judgeUid)
  );

  rest.push({
    id: `${round}:${teamId}:${judgeUid}`,
    round,
    teamId,
    teamName,
    judgeUid,
    score,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  });

  return writeAll(rest);
}

export function removeEntry(id) {
  writeAll(readAll().filter((entry) => entry.id !== id));
}

/**
 * Try to send everything queued.
 *
 * `write` is called as write({ round, teamId, teamName, judgeUid, score }) and
 * is expected to reject on failure. Entries that fail stay queued with their
 * attempt count bumped, so a flush is safe to call as often as you like — on
 * load, on reconnect, on a button press.
 *
 * Re-sending a card that actually did land is harmless: the write is keyed by
 * judge and team, so it overwrites itself with identical values.
 */
export async function flushPending(write, { judgeUid } = {}) {
  const queue = listPending(judgeUid);
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      await write(entry);
      removeEntry(entry.id);
      synced += 1;
    } catch (error) {
      failed += 1;
      const all = readAll();
      const target = all.find((candidate) => candidate.id === entry.id);
      if (target) {
        target.attempts += 1;
        target.lastError = error?.message ?? String(error);
        writeAll(all);
      }
    }
  }

  return { synced, failed };
}

/**
 * Reject if a promise has not settled within `ms`.
 *
 * The underlying write is NOT cancelled — it cannot be — so it may still land
 * later. That is why queued entries are safe to re-send: the write is
 * idempotent at its path.
 */
export function withTimeout(promise, ms = SUBMIT_TIMEOUT_MS) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed-out")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
