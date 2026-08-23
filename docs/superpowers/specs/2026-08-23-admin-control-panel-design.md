# Admin control panel — design

Date: 2026-08-23
Branch: `feat/admin-control-panel` (off `fixes`)
Status: approved, ready for an implementation plan

## Problem

Six admin pages exist and are read-heavy. Between them they can toggle a
check-in, mark a first-round judge, reassign a judge, and enter a paper score.
Everything else — the judging room list above all — requires opening the
Firebase console by hand.

That is fine until the day of the event, when a room floods, a judge does not
turn up, a name is misspelled on a badge, or a score is filed against the wrong
team. Today each of those needs either a console session or a full schedule
regeneration, and regeneration strands every score already collected.

The goal is direct control over the parts of the app that go wrong on the day,
with enough of a record afterwards to work out what happened.

## Scope

In scope:

1. **Config with no UI at all** — judging rooms, batch times, batch count,
   event start, final round room, the `/admins` list.
2. **Editing fields that already exist** — competitor and judge details, team
   name.
4. **Relationships and assignments** — move a competitor between teams,
   override a team's room or timeslot, force a team into the final round.
5. **Destructive recovery** — delete a score, clear a schedule, un-submit a
   team, reverse a check-in.

Out of scope:

3. **Creating and deleting competitors, judges and teams.** Highest cascade
   risk, and the client SDK cannot delete a Firebase Auth account — a "delete
   competitor" could only remove the `/competitors` record, leaving a working
   login that resolves to no role. Deferred to its own spec.

## Structural finding

`database.rules.json` already grants admins root `.read` and `.write`. This is
**not a permissions feature**. It is a UI feature and, more importantly, a
referential-integrity feature.

The schema is deliberately denormalised so that non-admins can read what they
need without read access to nodes they must not see. That means most edits fan
out:

| Change | Also lives at |
| --- | --- |
| Team name | `teams/{id}/schedule.teamName`, every judge's `teamAssignments/{id}.teamName` |
| Team room / time | `teams/{id}/schedule`, every assigned judge's `teamAssignments/{id}` |
| Remove a room | nothing — config and generated schedules are separate stores |
| Delete a competitor | `teams/{id}/members/{uid}` |

`src/user/judge/assignmentEdits.js` already solves exactly this shape with
atomic multi-path updates. That is the pattern to extend, not replace.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Shape | New `/user/admin/control` page for things with no home; edit drawers in place on the existing entity pages | The entity pages already have search and filters that work; duplicating them into a mega-page is code that exists |
| Removing an in-use room | Warn, then offer to remap affected teams atomically | The room-floods-at-4pm case; regenerating instead would strand scores |
| Audit | Log every panel action to `/adminLog` with before/after and undo | RTDB keeps no history; an overwrite is otherwise untraceable |
| Write layer | One shared `applyAdminAction` primitive; thin domain modules | Change and log entry land in one atomic update, so a change can never exist without its log entry |
| Rules | Add a `.validate` block for `/adminLog` | Pins entry shape; costs one manual republish round trip |

## Data model

### `/adminLog/{pushId}`

```
at        number     serverTimestamp()
by        string     pinned to auth.uid by the rules
byName    string     resolved at write time from /judges or /competitors, else uid prefix
action    string     dotted namespace — "room.remap", "competitor.edit", "score.delete"
summary   string     human-readable; what the feed shows
undoable  boolean
changes   [ { path, before, after } ]
undone    { at, by }     absent until undone
```

`before` and `after` are **JSON strings, not live values**. Three reasons:

- Realtime Database drops null values on write. A literal `before: null`
  (meaning "the field did not exist") would silently vanish, and undo would
  restore the wrong thing.
- Nested objects would otherwise have to survive the RTDB key charset.
- It reduces the `.validate` for those fields to `isString()`.

`by` is pinned to `auth.uid`, the same trick `enteredBy` already uses on score
cards, so an entry cannot be forged onto another admin.

**Size cap.** An entry carrying full before-state is fine for everything except
*Clear schedule*, which would capture every team's schedule plus every judge's
assignments — of the order of 100 KB. Above a 50 KB serialised cap the entry
records the action and counts only, and sets `undoable: false`. Clear schedule
is regenerable, so it gets a typed confirmation instead of an undo.

### `/config` additions

| Key | Status | Default / fallback |
| --- | --- | --- |
| `judgingRooms` | exists | `DEFAULT_ROOMS` (12). **Keep the array-of-strings shape** — `fetchRooms()` already tolerates array or object |
| `eventStart` | exists | `EVENT_START` |
| `batchTimes` | new | `BATCH_TIMES` |
| `batchCount` | new | `BATCH_COUNT` = 3 |
| `finalRoundRoom` | new | `FINAL_ROUND_ROOM` = "Rice 011" |

The hardcoded constants stay as fallbacks — the pattern `DEFAULT_ROOMS`
already uses — so nothing breaks when config is absent. `getJudgeSchedule`
gains a `fetchBatchConfig()` sibling to `fetchRooms()`.

Changing `batchCount` only affects the next generation. The UI says so.

## Rules diff

Only `/adminLog` gets a block. There is deliberately **no `.validate` under
`/config`**: adding `$other: false` there would reject `scheduleMeta` writes,
and the new keys are not security-sensitive.

```json
"adminLog": {
  "$entryId": {
    ".validate": "newData.hasChildren(['at','by','action','summary'])",
    "at":       { ".validate": "newData.isNumber() && newData.val() <= now" },
    "by":       { ".validate": "newData.val() === auth.uid" },
    "action":   { ".validate": "newData.isString() && newData.val().length <= 64" },
    "summary":  { ".validate": "newData.isString() && newData.val().length <= 500" },
    "changes":  { "$i": {
        "path":   { ".validate": "newData.isString() && newData.val().length <= 300" },
        "before": { ".validate": "newData.isString()" },
        "after":  { ".validate": "newData.isString()" },
        "$other": { ".validate": false } } },
    "$other":   { ".validate": false }
  }
}
```

No `.read` or `.write` is needed — the root admin rule already covers the node,
and the same rule excludes non-admins. Ordering comes free from push keys via
`limitToLast(100)`; no index required.

**Manual step this triggers:** republish `database.rules.json` in the Firebase
console, bump `// rulesVersion:` to 3, and paste the new digest into
`src/schema.test.js`. The test prints the exact digest when it fails.

## Write layer

```
src/user/admin/
  adminAction.js      the primitive
  roomsService.js     add / rename / remove, in-use detection, remap fan-out
  eventConfig.js      batch times, batch count, event start, final round room
  adminsService.js    grant / revoke, with lockout guards
  recordEdits.js      competitor / judge / team field edits, team-rename fan-out
  dangerZone.js       delete score, clear schedule, un-submit, reverse check-in
```

### The primitive

```js
applyAdminAction({ action, summary, changes, undoable = true })
```

1. `requireAdmin(action)` — the existing guard rail
2. resolve `byName`
3. build `updates[path] = after` for every change
4. add `updates['adminLog/' + pushKey] = entry`, with before/after stringified
5. **one** `update(ref(database), updates)`

The change and its log entry land in the same atomic update. There is no code
path that writes one without the other.

### Undo

`undoAdminAction(entryId)`:

- refuse if `undoable === false`, or if `undone` is already set
- **drift check** — read each path and compare against the logged `after`. Any
  mismatch refuses and names the path that moved. This is what stops an undo
  from clobbering a later edit by someone else.
- apply the reverse changes *through `applyAdminAction` itself*, so the undo is
  logged too, and set `undone: {at, by}` on the original in the same update

### Two guards that matter

**Admin lockout.** `/admins` is only writable by an admin, so nothing in the app
can create the first one — the README documents this chicken-and-egg. A revoke
that empties `/admins` is therefore permanently unrecoverable from the app.
`adminsService` refuses to revoke your own admin, and refuses to revoke the last
remaining admin. Granting takes a person picked by email search across
`/competitors` and `/judges`, not a pasted uid.

**Team rename fan-out.** A rename writes `teams/{id}/name`,
`teams/{id}/schedule.teamName` and every judge's `teamAssignments/{id}.teamName`
in one update.

## UI surface

### New page `/user/admin/control`

Stacked sections built on the existing `adminUi.js` furniture (`PageHeader`,
`RowList`, `Row`) so it matches the dense-list style. Danger zone collapsed by
default.

```
src/user/admin/Control.js              page shell, composes sections
src/user/admin/control/
  RoomsSection.js       list · add · rename · remove
  RemapDialog.js        in-use warning + destination picker
  ScheduleSection.js    batch count, batch times, final round room
  EventSection.js       event start date
  AdminsSection.js      grant / revoke, person search by email
  DangerSection.js      clear schedule
  ActivityFeed.js       log + undo
  EditDrawer.js         shared drawer shell
```

One component per section, roughly 100–150 lines each. The page subscribes once
(`onValue` on `/config`, `/admins`, and `limitToLast(100)` on `/adminLog`) and
passes data down; sections call services. No local mirror state — writes reflect
back through the existing subscriptions, as on every current admin page.

Nav: add "Control panel" to `ADMIN_LINKS` in `siteNav.js`; add the route in
`App.js` with `requiredRoles={["admin"]}`.

### Edit drawers on the existing pages

```
src/user/admin/edit/
  CompetitorEditDrawer.js
  JudgeEditDrawer.js
  TeamEditDrawer.js
```

Sharing the `EditDrawer.js` shell: title, dirty tracking, save/cancel, busy and
error states.

### Where each capability lives

| Capability | Page | Category |
| --- | --- | --- |
| Add / rename / remove room + remap | Control → Rooms | 1 |
| Batch count, batch times, final round room | Control → Schedule | 1 |
| Event start | Control → Event | 1 |
| Grant / revoke admin | Control → Admins | 1 |
| Activity feed + undo | Control → Activity | — |
| Clear schedule | Control → Danger | 5 |
| Competitor fields, reverse check-in | Competitors → drawer | 2, 5 |
| Move competitor between teams | Competitors → drawer | 4 |
| Judge fields, reverse check-in | Judges → drawer | 2, 5 |
| Rename team | Teams → drawer | 2 |
| Un-submit team | Teams → drawer | 5 |
| Override team room / timeslot | Teams → drawer | 4 |
| Force team into final round | Teams → drawer | 4 |
| Delete a score | Teams → score row | 5 |

### Three judgment calls

**The QR Scan page stays unlogged.** It is the normal high-volume path, and
logging every scan would bury the feed. The *manual* check-in toggles on
Competitors and Judges are logged — those are deliberate overrides, and "who
un-checked-in this person at 4:52" is the question worth answering.

**Score deletes are `undoable: false`,** forced by the rules. `enteredBy` is
pinned to `auth.uid`, which is where the "a judge cannot file under another
judge" guarantee lives, so restoring a deleted card would fail validation for
any admin who was not the original enterer. Rather than weaken that rule, the
log entry keeps the full card and the Undo button **opens `PaperScoreDialog`
prefilled** with the logged values. Two clicks, correct provenance
(`source: "paper"`, `enteredBy` = whoever re-entered it), security property
intact.

**Moving a competitor between teams** writes `competitors/{uid}/teamId`,
`teams/{old}/members/{uid} = null` and `teams/{new}/members/{uid} = true` in one
update, and warns if it empties the old team.

## Error handling

Every service returns `{ ok, error, ... }` and never throws, matching
`getJudgeSchedule` and `assignmentEdits`. `requireAdmin` throws internally and
is caught into `{ ok: false }`. `PERMISSION_DENIED` surfaces with the action
name rather than bare. Success and failure both land in a `Snackbar`, as
`JudgingProgress` already does. An undo drift refusal names the path that moved.

## Testing

Unit (jest, no emulator):

- `adminAction` — one update carries both change and log entry; `before`/`after`
  round-trip through JSON **including `null`**, the null-dropping bug the string
  encoding exists to prevent
- `roomsService` — in-use detection from a teams snapshot; remap emits the team
  schedule and every judge copy
- `recordEdits` — team rename emits all three denormalised copies
- `undoAdminAction` — reverse mapping; drift check refuses and names the path
- `adminsService` — refuses self-revoke and last-admin revoke

Rules (`test/rules/adminLog.test.mjs`, emulator):

- a non-admin can neither read nor write `/adminLog`
- an admin writes a well-formed entry
- an entry with `by !== auth.uid` is rejected
- an entry with an unknown key is rejected (`$other: false`)
- **an admin cannot restore another admin's score card** — pins the reason
  score deletes are `undoable: false`

Existing suites: `schema.test.js` bumps to `EXPECTED_VERSION = 3` with the new
digest and asserts `adminLog.$entryId.by` pins to `auth.uid`;
`pages.smoke.test.js` and `protectedRoute.test.js` gain the new route.

## Known limitations

- **The log is not tamper-proof.** Admins hold root `.write`, and rules cascade
  — a deeper rule can never take back a grant made above it. Deletes also skip
  `.validate`. An admin can erase entries. This is a forensics and coordination
  tool, not a ledger.
- **Undo is "revert to the captured value", not a transaction rollback.** The
  drift check makes it refuse rather than clobber, which is the safe failure.
- **`before` is captured by a read, then written.** A concurrent write in that
  window is lost. Multi-path `update()` is atomic but not a transaction against
  read state; `runTransaction` cannot span paths, so it is not an alternative.
  The affected paths are ones only admins touch.
- **Config and generated schedules are separate stores.** Room and batch config
  feeds the *next* generation. Existing schedules only change through an
  explicit remap or per-team override.
