/**
 * "1 judge", "3 judges". Messages used to say "judge(s)" -- and then "1
 * judges cannot cover" where nobody had bothered -- on the screens organizers
 * read under pressure.
 */
export function count(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The verb that agrees with `n`: has/have, is/are. */
export function agree(n, one, many) {
  return n === 1 ? one : many;
}
