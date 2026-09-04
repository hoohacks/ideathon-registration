/**
 * Team membership is stored as a keyed set:
 *
 *   teams/{teamId}/members/{uid} = true
 *
 * not as an array. The database rules decide who may read a team and who may
 * edit its submission with `members.hasChild(auth.uid)`, and that only matches
 * when the uid is the child *key*. An array is stored under numeric keys
 * ("0", "1", ...), so every one of those checks was silently false and the
 * member-scoped rules never applied.
 *
 * Teams created before that change still hold an array, so reads accept both.
 */
export function memberIds(members) {
  if (!members) return [];
  if (Array.isArray(members)) return members.filter(Boolean);
  if (typeof members !== "object") return [];
  return Object.entries(members)
    .filter(([, value]) => value)
    .map(([uid]) => uid);
}

export function isMember(members, uid) {
  return Boolean(uid) && memberIds(members).includes(uid);
}
