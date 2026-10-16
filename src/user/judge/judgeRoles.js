import { personName } from "../../roles.js";

/**
 * Who judges which round.
 *
 * The first round is opt-in: organizers ask who can make it, then mark those
 * judges `isRound1Judge`, and the generator allocates batches from them alone.
 * The mark is admin-set; the database rules stop a judge seeding it at
 * registration.
 *
 * The final round is open to every judge. There is no mark for it -- the pool
 * is whoever has checked in (see `finalRoundService`).
 *
 * This module is pure so that both planners, both drift readers and every
 * picker can share one answer. Two modules disagreeing about who counts is
 * exactly the bug `readLiveBasis` exists to avoid.
 */

/** Works the first round, and is therefore what the generator allocates from. */
export function judgesRoundOne(judge) {
  return judge?.isRound1Judge === true;
}

/**
 * The judges a per-team picker should offer, in the order it should offer them.
 *
 * Checked-in first, then by name: the useful answer to "who can I put on this
 * team right now" is almost always somebody already in the building, and a
 * picker that buries them under forty absent names is one an organizer scrolls
 * past rather than reads.
 *
 * Every judge is offered, because a no-show has to be fillable from whoever is
 * actually there. `notRoundOne` marks the ones the generator would never have
 * seated: seating one is a deliberate reach outside the first-round pool, and
 * the picker says so rather than presenting them as ordinary choices.
 */
export function judgePickerOptions(judgesData) {
  return Object.entries(judgesData ?? {})
    .map(([uid, judge]) => ({
      uid,
      name: personName(judge, "Unnamed Judge"),
      checkedIn: judge?.checkedIn === true,
      notRoundOne: !judgesRoundOne(judge),
    }))
    .sort(
      (a, b) => Number(b.checkedIn) - Number(a.checkedIn) || a.name.localeCompare(b.name)
    );
}
