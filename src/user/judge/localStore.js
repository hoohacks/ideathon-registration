/**
 * localStorage that cannot throw.
 *
 * Everything judging-side that survives a refresh goes through here. The point
 * is that a browser refusing storage — Safari private mode, a locked-down
 * managed device, a full quota — must degrade to "no draft saved" and never to
 * a thrown error in the middle of a judge submitting a score. That is the exact
 * moment this code runs, and it is the worst possible moment to crash.
 */

function storage() {
  try {
    // accessing window.localStorage itself throws in some privacy modes
    const store = window.localStorage;
    const probe = "__ideathon_probe__";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function readJson(key, fallback = null) {
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    // corrupt entry: treat it as absent rather than poisoning every later read
    return fallback;
  }
}

/** Returns false when the value could not be persisted, so callers can tell. */
export function writeJson(key, value) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* nothing useful to do */
  }
}

export function isAvailable() {
  return storage() !== null;
}
