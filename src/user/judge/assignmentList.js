/**
 * A judge's `teamAssignments` is stored as `{ teamId: assignment }`, not an
 * array. Realtime Database gives arrays numeric keys, which are fragile under
 * deletion and cannot be addressed by a security rule — the same shape problem
 * that made the member checks in the rules silently false.
 *
 * Object key order is not meaningful, so the batch number restores the order a
 * judge actually walks the rooms in. Schedules written before the change held
 * an array; both shapes are read here.
 */
export function assignmentList(raw) {
  if (!raw) return [];

  const values = Array.isArray(raw) ? raw : Object.values(raw);

  return values
    .filter((entry) => entry && typeof entry === "object")
    .sort((a, b) => (a.batch ?? 0) - (b.batch ?? 0));
}

export default assignmentList;
