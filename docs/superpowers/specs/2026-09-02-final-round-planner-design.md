# Final round planner — design

Date: 2026-09-02
Branch: `fixes`
Status: awaiting review

## Problem

The first round gets a planner. The final round gets a dialog.

`/user/admin/schedule` builds a first-round plan, shows it as a grid, lets an
organizer move a team, add, remove or swap a judge, undo any of it, and refuses
to publish onto state that has drifted. The draft survives a reload and two
organizers see each other's edits.

Activating the final round is a modal with a checkbox per team. Everything else
is derived at the moment of the write and cannot be touched:

- **Panels are computed, not chosen.** Every eligible judge is assigned to every
  finalist they did not score in round one. A judge who has to leave, or one you
  want on a particular team, cannot be moved.
- **Slot order is rank order.** `Slot 1…4` follows the ranking, so the top team
  presents first whether or not that is what you want on stage.
- **The room is a hardcoded constant.** `FINAL_ROUND_ROOM` in
  `finalRoundService.js:8` is written into every `finalSlot` and every judge
  assignment. `config/finalRoundRoom` is settable in the control panel, read by
  `eventConfig.js:36`, displayed by `ScheduleSection.js:18` — and ignored by the
  write. **This is a live bug, not just a gap.**
- **Nothing survives a reload.** The plan lives in React state in a dialog.
- **The cut size is hardcoded** at four.

The gap this closes is the same one the schedule preview closed for the first
round: the final round is planned, looked at, corrected, and only then written.

## Scope

In scope:

1. **A planner** that produces a full draft — finalists, slot order, room, and a
   panel per team — rather than a list of team ids.
2. **A persisted draft** at `/finalRoundDraft`, mirroring `/scheduleDraft`:
   optimistic concurrency, live subscription, survives a reload.
3. **An edit layer**: add, remove and swap a judge on a finalist; reorder slots;
   drop a team from the cut or put one back; set the room.
4. **Drift detection at publish**, extending today's score-staleness check to
   the rest of the plan, with targeted repair.
5. **UI**: `/user/admin/schedule` gains a First round / Final round switch and
   reuses the existing shell — stats bar, undo, discard, typed confirmation.
6. **`config/finalRoundSize`** (default 4), and **honouring
   `config/finalRoundRoom`**, which fixes the bug above.

Out of scope:

- **Several rooms running in parallel.** The final round is one room and a
  sequence of slots. See Decisions.
- **Drag and drop.** Editing is drawer-based, as the first-round planner is.
- **Restoring an archived role record** from `/archive/people`. Unrelated, and
  noted in the README as a known gap.
- **Any change to `database.rules.json`.** `/finalRoundDraft` inherits the
  admin-only root grant the way `/scheduleDraft` does. `rulesVersion` stays 5.

## Decisions

| Question | Decision |
| --- | --- |
| How the round runs | **One room, teams in sequence.** A judge cannot be in two places at once because there is only one place, so no clash checking is needed on the panel. |
| Where it lives | **`/user/admin/schedule`, with a round switch.** Reuses the shell and keeps one nav entry — which matters, since the Schedule nav entry was just removed in favour of the Judging page's button. |
| What Build produces | **The ranked cut with panels prefilled** — today's derivation, now as a starting point rather than the answer. |
| Cut size | **`config/finalRoundSize`, default 4**, with hand-picking on top. |

## Structural finding

Most of this exists.

`planFinalRound` already reads the world, ranks with an explicit tiebreak,
applies the cut, computes the round-one exclusions and emits warnings, and
writes nothing. `publishFinalRound` already takes a restore point, refuses on a
stale card count, and writes `finalRound/*`, every `teams/{id}/finalSlot` and
every `judges/{uid}/finalAssignments` in one atomic update.

What is missing is the middle: a draft that holds the derivation's *output* so it
can be edited, and a publisher that writes the draft rather than re-deriving.
`publishFinalRound` already honours the finalist set it is handed rather than
recomputing it — the same idea, extended from "which teams" to "which teams, in
what order, in front of whom".

The draft machinery is likewise not new. `draftStore.js` is generic apart from
its path and its decode; `applyEdit.js` is pure and small; `computeStats.js`
and `PlanGrid.js` are first-round-shaped but the pattern transfers.

## Data model

### `/finalRoundDraft`

```
version            integer, bumped on every save
updatedAt          serverTimestamp
updatedBy          uid
updatedByName      resolved display name
room               the one room, seeded from config/finalRoundRoom
ranked             { "0000": {teamId, name, averageScore, fundableVotes, judgeCount} }
assignments        { [teamId]: {teamId, teamName, order, judges: [{judgeId, judgeName}], conflicted: {uid: true}} }
edits              { "0000": {op, summary, before} }
basis              { cardCounts: {teamId: n}, eligibleJudges: {uid: true}, size, room }
```

`ranked` is the full ranking, not just the finalists — the cut UI needs the
teams below the line to offer them, and `checkDrift` needs their card counts.
It is keyed and zero-padded for the same reason `edits` is: Realtime Database
has no arrays, and order matters.

`assignments` is keyed by team id, like the first-round draft, so one entry can
be addressed and deleted without renumbering. Order lives in the `order` field
rather than in the key, because both are needed: address by team, present by
slot. `order` is `0…n-1` and every save asserts it is a permutation.

`conflicted` records judges deliberately put on a panel they scored in round
one. Without it, publish cannot tell an override from a mistake, and the
prefill would silently undo the organizer's edit on the next build.

### `basis` — the fingerprint

Same role as the first-round `basis`: what the plan was built from, re-read at
publish. `cardCounts` is already implemented and already checked across every
*ranked* team, not just the finalists — a card landing on a team below the line
can lift it above one, and that is the dangerous half. `eligibleJudges` is new:
the checked-in round-one pool at build time, so a judge who left can be named.

### The rules

`/finalRoundDraft` gets no entry in `database.rules.json`, deliberately, exactly
as `/scheduleDraft` does not. It inherits the admin-only root grant. An
unpublished final round — who made the cut, before it is announced — is the last
thing that should leak to a signed-in judge, and any rule written here could
only be equal or looser. `src/schema.test.js` gains an assertion that it stays
absent, mirroring the one for `/scheduleDraft`.

## The planner

`planFinalRound` keeps its signature and its refusals, and gains a `size` read
from `config/finalRoundSize` and a `room` read from `config/finalRoundRoom`. Its
return grows from `{finalists, ranked, warnings, basis}` to a full draft: an
`assignments` map with `order` following rank order and `judges` prefilled from
the eligible pool minus each team's round-one scorers.

Every existing warning survives — under-judged finalists, a tie across the cut
line, an empty judge pool, orphaned finalists — because they are all still true
of a plan, and they become the stats bar's warning row rather than a one-shot
alert.

## The edit layer

`applyFinalEdit(plan, op)`, pure, same shape as `applyEdit`: returns
`{ok, plan}` or `{ok: false, error}`, never mutates, appends to `edits`.

| Op | Rule |
| --- | --- |
| `addJudge` | Allowed even when they scored the team in round one — the organizer asked for it. Records the override in `conflicted` and warns; does not refuse. |
| `removeJudge` | Allowed. Removing the last judge leaves the team presenting to an empty room, which the stats bar counts and the publish confirmation names. |
| `swapJudge` | `removeJudge` then `addJudge`, one edit. |
| `moveSlot` | Moves a team to a slot index; everything between shifts by one. Refuses anything that is not a permutation. |
| `dropTeam` | Removes a finalist from the cut. Undoable, unlike the first-round drift `Drop`, because the ranked list still holds them. |
| `addTeam` | Puts a ranked team into the cut at the end, panel prefilled. |
| `setRoom` | One room for the whole round. |

`undoEdit` walks the newest edit back, repeatedly, exactly as it does today.

With one room there is no "judge in two places at once", so no op refuses on a
clash. The refusals that remain are structural: an unknown team, a judge who is
not in the eligible pool, a slot index out of range.

## Drift

`checkFinalDrift(basis, live, plan)`, classified the way the first round's is.

| What moved | Class | Repair |
| --- | --- | --- |
| A ranked team's card count changed | blocking | **Re-rank** — the averages the cut was made from have moved. This is today's `staleScores`, kept. |
| A judge on a panel lost their round-one mark, checked out, or was deleted | blocking | **Remove** them from that panel |
| A finalist withdrew or was deleted | blocking | **Drop** them from the plan |
| `config/finalRoundSize` changed | advisory | none — the cut in the draft is explicit |
| `config/finalRoundRoom` changed | advisory | **Apply** the new room |

Re-rank is the one repair that discards hand edits, and it says so before it
runs, naming how many would be lost — the same wording `Rebuild the plan` uses.

## The writer

`publishFinalRound(plan)` replaces `publishFinalRound({finalists, basis})`.

It re-reads, runs `checkFinalDrift`, refuses on anything blocking, takes a
restore point through the existing `guardWith` — abandoning the publish if the
snapshot cannot be written — and then writes what today's version writes, from
the plan rather than from a derivation:

- `finalRound/active|activatedAt|activatedBy|teams`
- `teams/{id}/finalSlot` for each finalist, `null` for everyone else
- `judges/{uid}/finalAssignments` for each judge on a panel, `null` for the rest

`excludedJudges` is still written into the standings, and still means "scored
this team in round one", which is what `peopleService` and `dangerZone` already
clean up. A `conflicted` override does not change it.

On success the draft is deleted, as `publishPlan` deletes `/scheduleDraft`.

Publishing requires the typed confirmation whenever a final round might already
be active, reusing the existing component and the `config/eventName`-or-count
phrase.

## UI surface

`/user/admin/schedule` gains a round toggle at the top. The first-round view is
unchanged.

The final-round view is a **list of slots**, not a batch × room grid — one room
means the grid's second axis is empty. Each row is `Slot n · Team · panel`, with
a **Judges** button opening the existing drawer pattern and up/down controls for
slot order.

Above it, two things:

- **The cut.** "Finalists — 4 of 17 ranked", expandable into the ranked list
  with a checkbox per row, which is today's dialog moved inline. The cut line
  and any tie straddling it are marked.
- **The stats bar.** Finalists, panel min and max, teams with no judge, judges
  with nothing to do, and conflict overrides.

`FinalRoundPreview.js` is retired. On the Judging page, **Activate final round**
becomes **Plan final round**, linking to the planner; **Deactivate final round**
stays where it is and keeps its confirmation.

## Error handling

Every service returns `{ok, error}` and never throws, as the existing ones do. A
failed `saveDraft` returns to the drawer rather than reporting the edit as saved.
A failed restore point abandons the publish. A drift refusal names the path.

## Testing

| Suite | Pins |
| --- | --- |
| `finalRoundPlan.test.js` | extended: prefill, cut size from config, room from config, the existing warnings |
| `applyFinalEdit.test.js` | the edit invariants across randomised edit walks, as `applyEdit.test.js` does — order stays a permutation, undo returns to the build |
| `finalDraftStore.test.js` | a stale save is refused, naming who moved it |
| `checkFinalDrift.test.js` | blocking vs advisory, and that the live read agrees with the planner about the eligible pool |
| `publishFinalRound.test.js` | a restore point is written before the standings; the draft is cleared after |
| `schema.test.js` | `/finalRoundDraft` has no rule of its own |

## Known limitations

- **One room.** Several rooms in parallel would need the first round's
  no-judge-in-two-rooms checking. Chosen deliberately; revisit if the format
  changes.
- **A hand-edited plan carries no guarantees.** Same caveat as the first round:
  panel balance is a property of what Build produced, not of what you edited it
  into. The stats bar is the only truth.
- **The planner cannot know the room flooded.** It removes the surprise from the
  write, not the need to look at the building.
