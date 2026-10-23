# Judging

## Judge supply

A judge visits at most one team per batch, so the largest batch,
`ceil(teams / batches)`, sets both limits.

| Rooms | Max teams (3 batches) | Min judges | Judges for a min of 3 |
| --- | --- | --- | --- |
| 8 | 24 | 8 | 24 |
| 12 | 36 | 12 | 36 |
| 20 | 60 | 20 | 60 |

**Max teams = rooms × batches.** Nothing else caps you.

- **Too few judges:** with fewer judges than teams presenting at once, building
  refuses and names both fixes: mark more judges, or raise the batch count so
  fewer teams present at once. With enough for one each but fewer than the min
  (`config/minJudgesPerTeam`, default 3), it builds anyway and warns, saying how
  many more judges would reach the min.
- **More judges than the min:** with no max (the default), every judge is seated
  and spread evenly across the rooms. With a max (`config/maxJudgesPerTeam`), the
  rest become spares, rotated so a different group sits out each batch. Both are
  set in Control panel, Event setup, Judging schedule.
- **Batches that do not divide evenly** are the thing to avoid. With 20 teams over
  3 batches (7/7/6), the smaller batch draws from a better ratio. Building says so
  and names a batch count that divides evenly.

The allocator (`src/user/judge/schedulePlan.js`) guarantees, for every event that
can be scheduled at all:

- no judge in two rooms at once
- no team without a judge
- panels within a batch differing by at most one
- every judge seated when there is no max, and nobody idle while a team is below
  the max when there is one
- judges reshuffled between batches

These are asserted across 1 to 60 teams, 1 to 40 judges, and 2 to 5 batches for the
allocator alone, and for the whole Build step (rooms and times included) across
every event up to 75 teams by 75 judges, events of up to 600 teams and 1000
judges, and 1 to 8 batches (`schedule.sweep.test.js`). The same file checks that
every number a refusal or a warning suggests actually works when applied.

## Planning a schedule

`/user/admin/schedule`, also **Plan schedule** on Judging progress.

Build a plan (this writes nothing), review the grid of batches by rooms with live
stats above it, hand-edit, then **Publish**. Publishing takes a restore point and
writes every assignment in one atomic update.

The draft lives at `/scheduleDraft`, so it survives a reload and two organizers
see each other's edits. **Undo** walks edits back to what the build produced.

Publishing asks you to type a confirmation phrase whenever a schedule might
already exist: `config/eventName` if it is set, the team count otherwise. Set the
event name once and everyone types something readable.

**Publishing refuses if the data moved**, and offers a targeted repair rather than
a rebuild:

| What moved | What you get |
| --- | --- |
| A team submitted since the plan was built | **Place** it into a named free slot |
| A team withdrew | **Drop** it from the plan |
| A judge on a panel lost their round-one mark | **Remove** them |
| A room the plan uses was removed | **Place** that team into a free room in the same batch |
| The batch count or judges per team changed | **Rebuild**: the shape of the day changed |

**A hand-edited plan no longer carries the allocator's guarantees.** Panel balance
and rotation are properties of a generated plan. Read the stats bar for what the
plan actually is.

## Planning the final round

The Final round tab on the same page, or **Plan final round** on Judging progress.

Building ranks every submitted team on its first-round average, cuts the top
`config/finalRoundSize` (default 4), and seats every eligible judge on every
panel. The final round is open to every judge, so there is no mark for it: the
pool is everyone who has checked in, or every first-round judge if nobody has. The finalists present in sequence to one room, so whoever is in it
hears every pitch, and **scoring a team in round one does not bar a judge from
it in the final**. Correct the running order and the panels, then publish.

**Times.** Control panel, Event setup, Final round time takes a start time and
minutes per finalist. Publishing still writes "Slot 1", "Slot 2"; with both set,
every page that shows a slot (the team's pitch card, the judge's final round
cards, this planner) shows it as a clock time counted from the start in running
order. Both are read live, so moving the start after publishing reaches everyone
without a republish. With only a start, teams and judges see when the round
starts and their place in the order.

The draft lives at `/finalRoundDraft`. An organizer may seat any registered judge
by hand, including one outside the pool.

**Ties at the cut.** The ranking always puts somebody in, using fundable votes,
then judge count, then name. When teams on the same average sit either side of
the line, the planner shows them as tied (T4) and warns. Decide which goes
through with **Add** and **Drop**, or take them all.

**Publishing clears `/scores/final`** after taking the restore point, so a
final round published a second time starts empty and does not count the first
one's cards.

**A judge who turns up after publishing** is added with **Add a judge** on
Judging progress, Final round. It seats them on every finalist and checks them
in, without republishing, so no card already filed is lost. Once they file a
card, Results names them as owing any team they arrived too late to score, the
same as a judge who left partway, and keeps saying Leading until the round is
closed. Closing counts whatever is in.

| What moved | What you get |
| --- | --- |
| Any team was scored since the build, including one that had no scores then | **Re-rank**: the averages the cut came from have moved |
| A finalist withdrew | **Drop** it |
| A judge on a panel no longer exists in the event | **Remove** them |
| The final round room changed | **Apply** it (advisory) |

## Results and closing the final round

**Results** shows the final standings live from the first card. The top card
says **Leading** while cards are due and **Winner** once they are in.

- **Judges who step out are not waited on.** A team waits only on seated judges
  who have filed a final card for some finalist. Anyone who has scored nobody is
  left out and named under the top card. A judge who scored some finalists and
  left is named in the warning with the teams they still owe.
- **A tie is a tie.** Teams on the same average (to two decimals) share a place.
  A shared first place reads **Tied for first**, shows fundable votes for
  reference, and leaves the order to organizers.
- **Closing the round makes it final.** **Close final round** on the judge page
  takes two confirmations and a typed phrase. It saves a restore point, withdraws
  every judge's final assignments and the teams' final slots, and archives the
  standings with the cards. The standings stay at `finalRound/teams`, so Results
  keeps showing them, marked closed, with whatever was in counted as the result.

## Judges on bad wifi

Judges need no instructions; their side copes on its own:

- every keystroke is saved as a draft on the device
- a submit that cannot reach the database is queued, not lost
- a write that hangs times out after eight seconds
- the queue survives a refresh and sends when the connection returns, and the
  cards are re-read when it does

One caveat: **a queued score only sends while that page is open.** If a judge
closes the tab, the card sits on their device and Judging progress shows the team
as unjudged. The browser's leave warning is armed whenever something is queued,
and only then.

The paper fallback is **Record score** on Judging progress, and the printable
room sheets.
