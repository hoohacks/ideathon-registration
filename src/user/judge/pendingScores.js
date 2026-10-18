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

// Exported only so resilience.test.js can spy on the exact key a second
// "tab" would race over; every other caller still goes through the
// functions below.
export const STORAGE_KEY = "ideathon:pendingScores:v1";

/**
 * How long a submit may hang before it is treated as un-acknowledged. Long
 * enough that a slow-but-working venue network still completes inline, short
 * enough that a judge is not staring at a spinner.
 */
export const SUBMIT_TIMEOUT_MS = 8000;

/**
 * The cross-tab lock name. All tabs on this origin that mutate the queue ask
 * for the same name, so the browser lets only one of them inside at a time.
 */
export const LOCK_NAME = "ideathon:pendingScores";

/**
 * How long to wait to acquire the lock before giving up and mutating anyway.
 *
 * A tab that froze or crashed while holding the lock must not jam the queue for
 * every other tab for the rest of the event. If the lock cannot be had in this
 * long, the mutation proceeds without it -- back to the pre-lock behavior,
 * which was a narrow race, rather than a permanent hang. Comfortably longer
 * than any real read-modify-write, which is a handful of synchronous
 * localStorage calls.
 */
export const LOCK_TIMEOUT_MS = 3000;

/**
 * Run `fn` inside the cross-tab exclusive lock when the Web Locks API is
 * available, and run it directly when it is not.
 *
 * Web Locks is the cross-tab primitive `localStorage` lacks: an exclusive lock
 * serializes every tab's read-modify-write of the queue, so the gap `enqueue`
 * could only ever narrow (see its comment) is closed. Where the API is missing
 * -- Node/jsdom test runners, older browsers -- this falls back to running the
 * mutation directly, exactly as before, with the optimistic re-read in
 * `enqueue` as the only guard.
 *
 * In the fallback it returns `fn()`'s value synchronously, so callers that read
 * `enqueue`'s boolean return keep working unchanged. Under a lock it returns a
 * promise of that value; the one production caller that reads the result
 * (`submitScore`) awaits it, which behaves identically either way.
 */
function withQueueLock(fn) {
  const locks = typeof navigator !== "undefined" && navigator.locks;
  if (!locks || typeof locks.request !== "function") return fn();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCK_TIMEOUT_MS);
  return locks
    .request(LOCK_NAME, { mode: "exclusive", signal: controller.signal }, fn)
    .catch((error) => {
      // An aborted acquisition is the timeout above firing: some tab is holding
      // the lock longer than any real mutation should, so proceed without it
      // rather than leave this card un-queued. A rejection thrown by `fn`
      // itself is a genuine error and must propagate.
      if (controller.signal.aborted) return fn();
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

const listeners = new Set();

let revisionCounter = 0;

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

/** Drop any existing queued card for this judge/team/round, then add this one. */
function nextQueue(current, cardEntry) {
  const rest = current.filter(
    (entry) =>
      !(entry.round === cardEntry.round && entry.teamId === cardEntry.teamId && entry.judgeUid === cardEntry.judgeUid)
  );
  rest.push(cardEntry);
  return rest;
}

/**
 * How many times to re-base and retry before giving up on detecting further
 * contention and just writing. Every attempt is one synchronous read of
 * localStorage -- cheap -- and this many rounds of a second tab's write
 * landing in this exact gap, back to back, is not something a real judging
 * session should ever produce.
 */
const MAX_ENQUEUE_ATTEMPTS = 5;

/**
 * Queue a card. One entry per judge/team/round: re-submitting the same card
 * replaces the queued one rather than stacking a second copy, so a judge who
 * taps submit three times on a dead network syncs one score, not three.
 *
 * Returns false when the device refused storage, which is the one case the
 * caller must surface as a real failure — there is nowhere left to keep it.
 *
 * This used to be readAll() -> filter -> push -> writeAll(), with nothing
 * checked in between. Two tabs of the judging page -- a restored tab, a PWA
 * relaunch -- can both read the same queue before either writes, and
 * whichever `writeAll` landed second silently replaced the queue the first
 * tab had just added its card to. Both tabs believed their card was queued;
 * only one of them actually was.
 *
 * The fix re-reads the queue immediately before writing and, if it has
 * changed since the read this call based its edit on, re-bases the same edit
 * onto the fresh read and tries again -- an unattended retry rather than a
 * user-facing refusal, because there is no "reload and try again" to show a
 * judge for a queue they never looked at directly.
 *
 * On its own the re-read only NARROWS the race -- `localStorage` has no
 * compare-and-swap, so `getItem` and `setItem` are two separate calls and a
 * second tab's write can still land in the gap between this call's last read
 * and its `writeAll`, however short that gap is made. `withQueueLock` closes
 * it: when the Web Locks API is available the whole read-modify-write below
 * runs inside an origin-wide exclusive lock, so no other tab can be reading or
 * writing the queue at the same time. Where Web Locks is missing -- older
 * browsers, the Node/jsdom test runner -- the lock is a no-op and the re-read
 * loop is exactly the narrowing guard it always was.
 */
export function enqueue({ round, teamId, teamName, judgeUid, score }) {
  const cardEntry = {
    id: `${round}:${teamId}:${judgeUid}`,
    // Which version of this card it is.
    //
    // The id is stable per judge/team/round, on purpose -- re-submitting
    // replaces rather than stacks. That is also how a card gets thrown away: a
    // flush that is still waiting on the network for version one would remove
    // "the entry with this id" on success, and by then the entry with that id
    // is version two. The judge's correction disappeared and the stale card
    // landed, which is the exact failure this whole module exists to prevent.
    //
    // The counter is here because two submissions inside one millisecond are
    // entirely possible on a double tap.
    revision: `${Date.now()}-${(revisionCounter += 1)}`,
    round,
    teamId,
    teamName,
    judgeUid,
    score,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  };

  return withQueueLock(() => {
    let before = readAll();
    for (let attempt = 0; attempt < MAX_ENQUEUE_ATTEMPTS; attempt += 1) {
      const rest = nextQueue(before, cardEntry);

      // Re-read right up against the write. If another tab's enqueue (or a
      // flush's remove) landed since `before` was read, `rest` was built on a
      // queue that no longer exists -- re-base on what is actually there now
      // and try again, instead of overwriting it. Under the lock this never
      // trips; without it, it is the narrowing guard described above.
      const justBefore = readAll();
      if (JSON.stringify(justBefore) !== JSON.stringify(before)) {
        before = justBefore;
        continue;
      }

      return writeAll(rest);
    }

    // Retries exhausted under sustained contention: commit against the
    // freshest read available rather than drop the card or hang forever. This
    // carries the same residual risk every attempt above already carried.
    return writeAll(nextQueue(readAll(), cardEntry));
  });
}

export function removeEntry(id) {
  return withQueueLock(() => writeAll(readAll().filter((entry) => entry.id !== id)));
}

/**
 * Drop a card only if it is still the one that was sent.
 *
 * If the judge re-submitted while the write was in the air, the queued entry is
 * a newer card wearing the same id, and it has to stay -- the write that just
 * landed was the old one.
 */
function removeIfCurrent(sent) {
  return withQueueLock(() => {
    const all = readAll();
    const stored = all.find((entry) => entry.id === sent.id);
    if (stored && stored.revision !== sent.revision) return;
    writeAll(all.filter((entry) => entry.id !== sent.id));
  });
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
export function flushPending(write, options = {}) {
  // Overlapping flushes are the normal case, not a rare one: the judging screen
  // drains once on mount and again on the rising edge of `.info/connected`,
  // which arrives milliseconds later. Both would walk the same queue and send
  // every card twice, on the network that was already failing.
  //
  // Chained rather than dropped, so a card queued while a flush is running is
  // still sent by the run behind it instead of waiting for a trigger that may
  // never come.
  const run = () => flushQueue(write, options);
  const next = chain ? chain.then(run, run) : run();
  chain = next.catch(() => {});
  return next;
}

let chain = null;

async function flushQueue(write, { judgeUid } = {}) {
  const queue = listPending(judgeUid);
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      await write(entry);
      // The network send above is deliberately outside the lock -- it can hang
      // for up to SUBMIT_TIMEOUT_MS, and holding a cross-tab lock across it
      // would make every other tab's enqueue time out. Only the storage edits
      // take the lock. `removeIfCurrent` returns a promise under a lock and
      // `undefined` in the fallback, so the guard keeps the fallback path free
      // of an extra microtask and leaves the existing flush timing untouched.
      const removed = removeIfCurrent(entry);
      if (removed) await removed;
      synced += 1;
    } catch (error) {
      failed += 1;
      const bumped = withQueueLock(() => {
        const all = readAll();
        const target = all.find((candidate) => candidate.id === entry.id);
        if (target) {
          target.attempts += 1;
          target.lastError = error?.message ?? String(error);
          writeAll(all);
        }
      });
      if (bumped) await bumped;
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
