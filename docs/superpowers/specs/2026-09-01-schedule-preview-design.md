# Schedule preview and publish — design

Date: 2026-09-01
Branch: `feat/schedule-preview` (off `fixes`)
Status: approved, ready for an implementation plan

## Problem

Every bulk write in this app is unseeable until it has happened.

**Generate Schedule** reads the event, builds a schedule, and replaces every
assignment in it, in one press. The organizer's first sight of the plan is the
plan already being live. If a panel is lopsided, a team is in the wrong room, or
a judge who resigned that morning is still on three cards, the fix is either a
regenerate — which moves every other assignment and strands every score already
collected — or a walk through `assignmentEdits` one team at a time.

**Activate Final Round** has the same shape: it ranks, cuts the top four and
writes the standings before anyone sees where the line fell or which ties were
broken to put it there.

**Restore** overwrites, and the scores it will destroy are named nowhere until
they are gone.

The three most destructive actions in the app share one missing step. This spec
adds it: nothing bulk is written until it has been looked at.

## Scope

In scope:

1. **Splitting generation into a planner and a writer.** `getJudgeSchedule`
   becomes `planSchedule` (reads, builds, writes nothing) and `publishPlan`
   (validates against drift, snapshots, writes).
2. **A persisted, editable draft** at `/scheduleDraft`, with four pure edit
   operations and a live preview page.
3. **Staleness detection at publish**, classified into blocking and advisory,
   with targeted repair rather than a rebuild.
4. **The same review step for the final round cut and for restoring a restore
   point.**
5. **A typed confirmation component**, replacing the two `window.confirm` calls
   that guard the most destructive buttons in the app.

Out of scope, each noted as a follow-on:

- **Roles as a dropdown** on the control panel. Independent, and small enough to
  go on its own.
- **A readiness panel** computing the README's "Before the day" table.
- **Printing the plan**, and paper fallback generally.
- **Event phases** gating destructive actions by where the day has got to.
- **Drag and drop.** Editing is drawer-based; see "Three judgment calls".

## Structural finding

`planSchedule` is not new code. It is the top two thirds of `getJudgeSchedule`
with the write removed. Everything from the role check down to the
repeat-pairings tally already reads state, decides, and touches nothing — it
just happens to sit above an `update()` in the same function. The split is
mostly a cut, and the arithmetic underneath it in `schedulePlan.js` was already
separated for exactly this reason.

The second finding is what makes the draft cheap. The root rule grants admins
`.read` and `.write` on everything; `/config` carries `.read: "auth != null"`.
A draft parked under `/config` would therefore be readable by every signed-in
judge and competitor — the schedule, and who is judging whom, before it is
decided. A new top-level `/scheduleDraft` inherits the admin-only root grant and
nothing else.

**So there is no rules change. `rulesVersion` stays 5 and nothing needs
republishing.** This is the same argument `snapshots.js` makes for choosing
`/snapshots` over an inline payload, and it is worth as much here: the README's
"Nothing deploys it for you" is the sharpest operational edge in the project.

## Decisions

| Decision | Why |
| --- | --- |
| The draft is persisted, not React state | `getJudgeSchedule.js:289` already records what React state cost the last time: a reload silently removed the only thing standing between a stray click and every assignment being replaced. A hand-tuned plan is a bigger thing to lose than a confirmation flag. |
| The fingerprint is stored literally, not hashed | Fifty short strings. Storing them is what lets publish say *what* moved instead of "something moved". |
| Blocking drift offers repair, not a rebuild | A rebuild discards the edits that made the plan worth publishing. The edit ops already cover every repair case. |
| `getJudgeSchedule` is deleted, not kept as a wrapper | Once the UI only goes through preview, a surviving generate-and-write path is dead code with a test guarding it. |
| The final round has no persisted draft | It is a decision made in one sitting under time pressure, not a plan built over twenty minutes. Different problem; React state is honest for it. |
| Edits go through a drawer, not drag and drop | Matches `records/EditDrawer.js`, works on the phone an organizer is actually holding, adds no dependency. |

## Data model

### `/scheduleDraft`

```
/scheduleDraft
  createdAt          serverTimestamp
  createdBy          uid
  createdByName      resolved at creation, as adminLog does
  onlyCheckedIn      bool, the filter the plan was built under
  version            integer, bumped on every write
  basis              the fingerprint, below
  assignments/{teamId}
                     { teamName, id, room, time, batch, judges: [{judgeId, judgeName}] }
  edits/{pushId}     { at, by, op, summary, before }
```

`assignments` is keyed by team id and shaped exactly as `teams/{id}/schedule` is
written today, so publishing is close to a copy rather than a translation. The
`judges` list inside an assignment stays an array, because that is the shape the
schedule is already written in and the shape `assignmentEdits.js` reads back.

`edits` is keyed by push id, not an array — push keys are chronological, which is
how `adminLog` orders itself, and the README's "sets are keyed, never arrays"
applies to anything a rule might one day have to address by key.

Each entry carries `before` for the single team an op touched — a few hundred
bytes — which makes undo trivial and reuses the before-state idiom `adminLog`
established. It also gives the publish audit entry something worth reading: not
"generated the schedule" but "generated, then hand-edited: swapped Ada for Bo on
Team Lumen, moved Team Morrow to batch 2".

`version` handles two organizers. The preview subscribes with `onValue` the way
`Control.js` does, so both see each other's edits live and a genuine write-write
race is rare. When one lands, the stale write is refused by name: "Sam moved
Team Lumen while you were looking."

### `basis` — the fingerprint

```
basis
  teamIds[]     sorted ids of submitted teams at plan time
  judgeIds[]    sorted ids of eligible judges, after the onlyCheckedIn filter
  rooms[]       config/judgingRooms as read
  batchCount    number
  batchTimes    map
  target        config/targetJudgesPerTeam as read
```

### `/scheduleDraft` and the rules

No rule of its own. It sits under the root admin grant. `schema.test.js` gains an
assertion that no rule exists at that path, so a later edit cannot quietly give
it a `.read` and leak the plan to every signed-in judge. That file already
exists to catch this class of drift.

## The planner

`planSchedule({ onlyCheckedIn }) → { ok, error, advice, warnings, plan, stats }`

Reads judges, teams, rooms and batch config. Runs `describeSupply` unchanged.
Builds `teamAssignments` and `assignmentsByJudge`. Writes nothing. Returns the
plan and its `basis`.

Every existing failure and warning is preserved verbatim: no rooms configured,
too few judges for the largest batch, batches that do not divide evenly, teams
that will be seen by one judge only, spares named, blank team names. These are
the messages an organizer acts on, and the wording in `describeSupply` was
written to be actionable. Nothing here rewrites them.

`stats` moves from write time to plan time. Today it is calculated at the one
moment nobody can act on it. It is produced by a separate pure
`computeStats(plan)` — panel min and max, spares, teams below target, repeat
pairings — which the planner calls once and the preview calls again after every
edit, so the numbers above the grid always describe the plan on screen rather
than the plan as generated.

## The draft store

`draftStore.js` — `readDraft()`, `saveDraft(plan)`, `clearDraft()`,
`subscribeDraft(cb)`. Thin. `saveDraft` refuses on a stale `version` and names
who moved what.

## The edit layer

`applyEdit(plan, op) → { plan, warnings, blocked }`. Pure. No database.

This is `assignmentEdits.js`'s logic with the fan-out removed. In a draft there
is no denormalised second copy to keep in step, which is the hard part of that
file and most of its length.

| Op | Refuses when | Offers |
| --- | --- | --- |
| `moveTeam({ teamId, batch, room })` | the room is taken in that batch; a judge on the team is already booked in the target batch | drop the clashing judge and move |
| `addJudge({ teamId, judgeUid })` | the judge is already in another room that batch | — |
| `removeJudge({ teamId, judgeUid })` | it would leave the team with zero judges | the same message `unassignJudgeFromTeam` already gives |
| `swapJudge({ teamId, fromUid, toUid })` | either of the above | — |

`moveTeam` doubles as *place*: a team not currently in `assignments` moves into
a free slot through the same call. That is what makes late-submission repair one
function rather than a special case.

`undoEdit()` takes the newest entry in `edits`, restores its `before`, and
removes it. Repeated, it walks the plan back to what the generator produced,
which is why no separate baseline copy is stored.

## Drift

`checkDrift(basis) → { blocking[], advisory[] }`, run by `publishPlan` before
anything else.

**Blocking** — the plan is wrong, not merely stale:

| Drift | Repair offered |
| --- | --- |
| A team submitted after the plan was built | place it — `moveTeam` into a free slot, listed |
| A team withdrew its submission | drop it from the plan |
| A judge on a panel lost `isRound1Judge` | swap them out on the teams they are on |
| Rooms shrank below what the plan uses | name the teams in the missing rooms; move them |
| `batchCount` or `target` changed | rebuild — the shape of the day changed |

**Advisory** — shown, publishes fine: a name changed; a judge checked in who was
not in the pool when `onlyCheckedIn` was set; `batchTimes` changed, which is a
label per batch and is re-applied to the draft rather than invalidating it.

Rebuilding from scratch stays available throughout, labelled as discarding the
manual edits.

## The writer

`publishPlan(draft) → { ok, error, drift, snapshotId, stats }`

1. `requireAdmin` — the guard rail, not the boundary, exactly as now.
2. `checkDrift`. Blocking drift returns without writing.
3. `guardWith` over `["teams", "judges", "config/scheduleMeta"]`. **A failure to
   take the restore point abandons the publish.** Unchanged.
4. One atomic multi-path `update()`: every judge's `teamAssignments`, every
   team's `schedule`, `config/scheduleMeta`, the `adminLog` entry, and
   `scheduleDraft: null`.

Step 4 is the existing write with the draft clear appended. The audit entry gains
the edit summary from `edits[]`; it stays `undoable: false`, because the
before-state is in the restore point and that is precisely what the log's size
cap cannot hold.

## UI surface

### New page `/user/admin/schedule`

`Assignments.js` is already four hundred lines carrying both a judge's own cards
and the admin controls. The preview does not go in it. The Judging page's button
becomes **Plan schedule**, or **Resume draft (3 edits)** when one exists, and
navigates here.

Batches as columns, rooms as rows; stacked vertically below `sm`, because
organizers are on phones. Each cell is a team card with its panel as chips —
amber below `target`, red at zero. Above the grid, the live stats: panel min and
max, spares, teams below target, repeat pairings. Beside it, the two lists that
are otherwise invisible: spare judges, and any team with no slot.

A team card opens a drawer — move to a batch and free room, add, remove or swap
a judge. Every op runs through `applyEdit`, so a refusal is the same refusal the
service layer would have given, before anything is written.

The publish bar is sticky and states what will happen before it happens: a
restore point will be taken, every assignment will be replaced, and if scores
exist, how many will be stranded. It carries the typed confirmation when a
schedule with scores already exists.

The preview adds a step to the most time-pressured action of the day. A clean
plan opens all green with Publish enabled, so it stays two clicks when nothing
is wrong. That is the constraint the page is designed against.

### Final round cut preview

`planFinalRound()` returns the ranking, where the cut falls, per-team exclusions,
and the warnings that already exist — teams below `MIN_JUDGES_FOR_CONFIDENCE`,
ties and how they were broken, a finalist with nobody eligible to judge it.
`publishFinalRound()` writes. Which teams are in can be overridden before
publishing, which the app can already do afterwards.

React state, no persisted draft. The fingerprint still applies and matters more
here than anywhere: scores keep landing during deliberation, so a card that
arrived since the ranking was computed says so and offers a re-rank, rather than
cutting on stale averages.

### Restore point diff

A client-side diff of the snapshot payload against the live tree. No new
storage — `/snapshots/{id}` already holds the JSON. Counts per path, and then
the part that is not reversible spelled out by name: which cards, on which
teams, by which judges, will be gone. Restoring already saves current state
first, so this is about not being surprised, not about recovery.

### Typed confirmation

One `<ConfirmDialog>` in `adminUi.js`: title, consequences, optional
`typeToConfirm`. Replaces `window.confirm` at `Assignments.js:132` and `:174`.

The phrase to type is the **event name from config**, not "DELETE" — people type
DELETE on autopilot. Where no event name is set, the team count.

This standardises the component and swaps those two call sites. It is not a
rework of `DangerSection`, which has its own flow.

### Three judgment calls

**Drawer, not drag and drop.** Drag is the obvious gesture for a grid and the
wrong one here: it needs a dependency, it is hostile on a touchscreen, and it is
unreachable by keyboard. The drawer matches how every other record in this app
is edited.

**The draft is persisted but not shared as a workflow.** Two organizers see the
same draft live, and one can stop the other's stale write. There is no
assignment of ownership, no lock and no review step. The event has one control
panel and a handful of people around it; a second organizer opening the page is
a thing to survive, not a role to model.

**Publish clears the draft; nothing else does automatically.** A plan built and
abandoned sits there. The page shows its age and offers Discard. Expiring it on
a timer would delete work while someone was at lunch.

## Error handling

Unchanged from the existing contract: every service returns `{ ok, error }` and
never throws. `PERMISSION_DENIED` surfaces with the action name. Success and
failure both land in the `Snackbar`.

Three new failure surfaces:

- **A stale `version` on save** names the person and the team that moved.
- **Blocking drift at publish** names each item and its repair. The plan is not
  discarded and nothing is written.
- **A snapshot failure at publish** abandons the publish, as it does today, and
  the draft survives — the plan is not lost to a failed restore point.

## Testing

Unit (jest, no emulator):

- `applyEdit` — the one that matters most, and it touches no database. Across
  randomised edit sequences: no judge in two rooms in a batch, no two teams in
  one room in a batch, no team with zero judges. These are
  `schedulePlan.test.js`'s invariants, now holding under human editing rather
  than only under the generator.
- `planSchedule` — the existing invariants asserted on the returned plan
  directly, unmocked, plus every `describeSupply` refusal preserved.
- `publishPlan` — `generateSchedule.test.js` repointed: restore point taken
  first, a snapshot failure abandons everything, the payload matches the draft,
  the draft is cleared in the same update, blocking drift refuses and writes
  nothing.
- `checkDrift` — each blocking and advisory classification, and that an empty
  diff publishes.
- `draftStore` — a stale `version` is refused and names what moved.
- `planFinalRound` — the cut, the tie-break, the confidence warning, and a
  re-rank offered when a card arrived since.

Existing suites: `schema.test.js` keeps `EXPECTED_VERSION = 5` — **the rules do
not change** — and gains the assertion that `/scheduleDraft` has no rule of its
own. `pages.smoke.test.js` and `protectedRoute.test.js` gain the new route.

No new rules tests, because there are no new rules.

## Known limitations

- **The draft is not a transaction against read state.** `basis` is captured by
  a read and compared by another read at publish. A write landing between the
  drift check and the `update()` is not caught. The window is milliseconds and
  the paths are ones only admins touch — the same limitation `adminLog`'s undo
  already carries, and for the same reason: `runTransaction` cannot span paths.
- **`version` is optimistic, not a lock.** Two organizers editing the same team
  in the same second: one wins, one is told. Nothing prevents the loser
  reapplying immediately and getting what they wanted.
- **Drift repair is offered, not automatic.** A plan built at 9am and published
  at 11am after four repairs is a plan a human assembled, and the allocator's
  guarantees about panel balance and judge rotation no longer strictly hold. The
  stats bar reports the actual numbers, which is the mitigation, but the
  invariants asserted in `schedulePlan.test.js` are guarantees about generated
  plans only.
- **The preview shows the plan, not the room.** It cannot know a room flooded,
  a judge left early, or that two teams asked to swap. It removes the surprise
  from the write; it does not remove the need to look at the building.
- **Nothing here helps a schedule already published.** Per-team repair after the
  fact stays where it is, in `assignmentEdits.js`. This spec makes the first
  write worth trusting; it does not change the second.
