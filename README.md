# Ideathon Registration

Registration, check-in, team submission and judging for the HooHacks Ideathon.

React + Firebase Realtime Database, no server. The database rules are the only
real authorization — every role check in React is advisory.

---

## Quick start

```
npm install
npm run emulators        # terminal 1: database, auth, storage
npm run seed             # terminal 2: a plausible event
npm run start:emulator   # terminal 3: the app, on local data
```

Sign in as `admin@example.com` / `testtest`. Judges are `judge1@example.com`
upward, competitors `competitor1@example.com` upward, same password.

`npm start` (without `:emulator`) talks to the **live** project. Use it only
when you mean to.

| Command | Does |
| --- | --- |
| `npm run start:emulator` | app on local data |
| `npm run emulators` | database, auth, storage emulators |
| `npm run seed` | fill the emulator with an event |
| `npm run test:ci` | unit tests once (what CI runs) |
| `npm run test:rules` | rules executed against the emulator (needs a JDK) |
| `npm run test:e2e` | the app driven in a real browser against the emulators |

### What runs where

| | Pull request | Push to a branch | Release | By hand |
| --- | --- | --- | --- | --- |
| Unit tests, rules, build | yes | **no** | yes | yes |
| Browser journeys | yes | **no** | no | yes |
| Deploy to gh-pages | no | no | yes | yes |

Nothing runs on an ordinary push. A branch somebody is still working on does not
need the whole suite on every commit, and the gate that matters is the one
before code merges. The consequence worth knowing: **a direct push to main runs
nothing** — merging through a pull request is what keeps that from being a gap.

Both workflows take `workflow_dispatch`, so either can be run from the Actions
tab on any branch.

Deploying happens on a **published release**, not on a merge, and it is the one
workflow that does not run the browser suite: a flaky spec must not stand
between the event and a fix that needs to go out now. Its `workflow_dispatch` is
the same emergency handle.

On failure the browser job keeps its report — trace, screenshot and the DOM at
the moment it broke — as an artifact for seven days, so a red run can be read
without reproducing it locally.
| `npm run build` | production bundle |

`npm run seed` takes `--teams`, `--judges`, `--rooms`, `--batches`, `--scores`,
`--schedule`. It only ever writes to the emulator.

Two things that will confuse you:

- **Seeding recreates every account.** A tab that was signed in now holds a
  credential for a uid that no longer exists. Sign in again.
- **Seed at least 8 teams** to exercise the final round. Below about six, every
  judge sees every team in round one, so all are excluded from the final and
  activation produces no assignments. That is the data, not a bug.

---

## First-time Firebase setup

Only needed once per project.

1. Enable **Email/Password** auth.
2. Publish `database.rules.json` (Realtime Database → Rules).
3. Publish `storage.rules`. Without it, resume and pitch deck uploads fail.
4. **Create the first admin by hand.** Register an account, copy its uid from
   the Authentication tab, then add `admins/<uid>: true` in the database.

Step 4 cannot be done in the app: writing `/admins` requires already being an
admin. Everything after the first admin is done from the control panel.

---

## Running the event

Everything below is in the app. You should not need the Firebase console.

### Before the day

| Do | Where |
| --- | --- |
| Add the rooms you booked | Control panel → Judging rooms |
| Set batch count, times, final round room | Control panel → Judging schedule |
| Set the event date | Control panel → Event |
| Add admins, judges, competitors | Control panel → People and roles |
| Send judges their sign-up link | `/judge-registration` — see below |
| Mark first-round judges | People and roles, or Judge Search |

Judging rooms have **no built-in list**. Add them or building a plan refuses.

### The two public pages

Neither needs a login, and neither is linked from anywhere in the app. Send the
URL.

| Page | Path | Collects |
| --- | --- | --- |
| Competitor registration | `/` and `/IdeaX` | name, email, major, school year, skills, resume upload, dietary needs |
| Judge registration | `/judge-registration` | name, email, company, whether they can mentor and which shifts, whether they can judge, skills |

**The app is a HashRouter, so every route lives after a `#`:**

| | URL |
| --- | --- |
| Local | `http://localhost:3000/#/judge-registration` |
| Production | `https://hoohacks.github.io/IdeaX/#/judge-registration` |

The same URL without the `#` used to serve the **competitor** form — an empty
hash matches `/` — so a judge sent the tidy-looking link signed up as a
competitor with nothing on screen to say so. `src/hashRedirect.js` now rewrites
a path-shaped URL to the hash route of the same name before React mounts, and
`public/404.html` does it on GitHub Pages, where such a request never reaches
the bundle. Both URLs work; the `#` one is still the one to send.

They share `RegistrationShell` and `Hero`, so the two forms are siblings by
design. The judge one carries **its own accent** — indigo rather than the
crimson taken from the logo — through its progress meter, its rail counters and
its submit button, plus its own tab title, because a judge sent the wrong link
should be able to tell on sight. That is a nested `ThemeProvider` swapping one
palette entry (`judgeTheme` in `theme.js`), not a second set of components;
`theme.test.js` pins that the two accents stay different and that the judge one
still holds AA as text.

Registering as a judge creates the account and the `/judges/{uid}` record. It
does **not** mark them as a first-round judge — that is deliberate, and it is
the one thing the rules will not let a judge set for themselves, since the score
rules treat an assignment as proof of assignment. Mark them in People and roles
or Judge Search once they turn up.

### On the day

1. Check people in with the scanner, or in bulk from People and roles.
2. **Plan schedule** on the Judging page: build a plan at `/user/admin/schedule`,
   review and hand-edit it, then **Publish**.
3. Judges score from their assignment cards.
4. Watch **Judging progress** — teams with no scores sort to the top in red.
5. **Plan final round** on the Judging page, or the Final round tab at
   `/user/admin/schedule`: build the cut, fix the running order and the panels,
   then **Publish**.

Scoring is out of 40: problem, innovation and impact are worth 10 each,
viability and pitch quality 5 each. `fundable` is a tally, not a score.

### When something goes wrong

| Problem | Do this |
| --- | --- |
| A judge did not turn up | **Judges** on the team row → add or swap. Rewrites one team, not the schedule. Spares are listed first. |
| A team name is wrong | **Edit** on the Teams dashboard. The name is cached on the schedule, on every judge's card for both rounds, and in the standings; renaming rewrites all of them. |
| A room name is wrong | Control panel → Judging rooms → rename. Reaches the first-round schedule, the final round slots, both sets of judge cards and the standings. |
| A judge scored on paper | **Record score** on the team row. Filed under them, stamped with you. |
| A judge says they submitted, nothing shows | Ask if their page says "saved on this device". Queued scores send on reconnect — the page must stay open. **Retry now** forces it. |
| A team submitted after the schedule was published | Open the team on the Teams dashboard → pick batch, room and judges. **Do not plan and publish a new schedule** — that replaces every assignment and strands collected scores. |
| A team submitted while you still have a plan open, unpublished | Publish will catch it as drift and offer **Place** — it drops the team into a free slot without touching anything else you already fixed. |
| A team has no scores, time is short | Assign a spare judge, or record the score yourself. |
| Scores from an unassigned judge | Expected after publishing a new schedule. They still count, so Judging progress lists them. |
| You cleared the schedule or published a bad one by mistake | Control panel → **Restore points**. |
| You want a copy of everything | Control panel → **Export**. |

---

## The organizer dashboard

`/user/home`, for anyone with the admin role. It answers three questions the
nav could not:

- **Where the day is** — `Setting up` → `Ready to schedule` → `Schedule
  published` → `Judging in progress` → `Final round`, derived from the data
  rather than from a flag, so it cannot drift out of step with reality.
- **What is not ready** — five checks with the real number beside each, and a
  link to the page that fixes it. The blocking one reuses `describeSupply`, the
  planner's own refusal logic, asked early enough to act on rather than at the
  moment a build refuses.
- **What to do next** — at most three actions. An unpublished draft outranks
  everything, because judges see nothing until it is published.

It also carries the two pre-event jobs that **fail silently** if nobody does
them, which is why nothing else in the app would ever mention them:

| Blocker | Why it is quiet |
| --- | --- |
| Database rules not published | Until version 5 is deployed, restoring a restore point that contains scores fails and changes nothing. Rules cannot be read from a browser, so an admin records what they published in `config/rulesVersion` and the dashboard compares it. |
| Score migration unfinished | Cards still under `teams/{id}/scores` mean every average is read from two locations at once. The dashboard counts the teams that still have them. |

## Results

`/user/admin/results`. The final round ranked on its **own** scores, by the same
tiebreak the cut used, with each team's first-round average kept beside it.

There was no screen for this before: the standings were written at activation,
never read — `subscribeToFinalRoundStandings` was exported and never imported —
and they carry the first round's averages, which nothing updates as final scores
arrive. Finding the winner meant exporting raw cards and doing the arithmetic.

The page is careful about one thing: **a ranking with cards outstanding is a
running total, not a result.** There is always a first row, because the tiebreak
is a total order — so no winner is declared until every expected card is in, and
until then it names who it is waiting on.

`Standings — final round` is now an export too; it matches this page.

## Room sheets

`/user/admin/print`. One printable sheet per room — batch, time, team, panel,
and a blank column for the score.

The paper fallback was already treated as ordinary (there is a **Record score**
flow for it) but nothing printed, so it began with someone copying a screen by
hand. A room is the unit rather than a batch because a judge stays put while
teams rotate through: one sheet on one door covers the evening.

## The control panel

`/user/admin/control`. Everything that used to need the Firebase console.

| Section | Does |
| --- | --- |
| Judging rooms | add, rename, remove. Removing one a schedule uses offers to move those teams |
| Judging schedule | batch count, batch times, final round room |
| Schedule | build, review, hand-edit and publish the judging schedule — a separate page, `/user/admin/schedule`, also on the nav |
| Event | event start date |
| People and roles | set each person's one role, create accounts, reset passwords, bulk check-in, delete people |
| Export | schedule, scores, standings, judges, full JSON backup |
| Restore points | recover from a bad publish or wipe |
| Advanced | create an empty team, write any config key |

The sections are grouped into four tabs — **Event setup**, **People**, **Data
and activity**, **Recovery** — and the tab is in the URL (`?tab=recovery`), so a
readiness check can send someone straight to the section that fixes it and one
organizer can tell another where to look. They were one scroll before, which put
the danger zone three flicks below whatever you came for.
| Recent activity | what changed, with undo |
| Danger zone | clear the schedule, optionally with every score |

Per-record editing lives on the Competitors, Judges and Teams dashboards
(**Edit** on each row).

### People and roles

A role is membership of a node: `/judges/{uid}` or `/competitors/{uid}`. **One
account holds exactly one of them**, picked from the dropdown on each row —
Judge, Competitor, or no role.

**Admin is a flag on top, not one of them.** `/admins/{uid}` is `true` and
nothing else, and it has its own switch on the row. It has to sit on top: an
admin who judges needs the judge record, because being scheduled, seeing
your cards and filing a score under your own name all key off it. Making
admin exclusive with the rest silently took judging away from them.

Changing it deletes the record for the role they are leaving and creates one for
the role they are taking, carrying their name, email and company across. The
confirmation names what goes with the old record: their team, their resume,
their judging assignments, their round-one mark. Scores they filed are kept —
they still count toward the averages the final round is picked from.

**The deleted record is archived first,** to `/archive/people/{uid}/{ts}-{role}`,
in the same atomic write. Nothing in the app puts it back yet; read it from the
console, or from a JSON export.

It used to be a `+`/`−` button per role, with roles additive. Two of those
buttons in a row looks like one action — `− Competitor` deletes the record and
`+ Competitor` writes an empty one back — and the account reads as having wiped
itself. The dropdown is one action with one confirmation.

An admin who holds no role has no record and so no name anywhere. The list
falls back to the most recent archived record for their name and email.

Accounts that predate this hold more than one role. Their dropdown reads
**Multiple — pick one** until you choose, which collapses them to that role.

You can also create a login and record, attach a record to an existing login,
email a password reset, bulk check-in, bulk mark round-one judges, and delete
someone entirely.

Two limits are real, and shown in the UI:

- **Deleting someone does not delete their login.** A browser cannot delete a
  Firebase Auth account. Their records go; they can still sign in and will see
  an account with no role. Remove the account in the console if it matters.
- **You cannot set a password.** Send a reset email instead.

Moving someone off judge also removes them from every team's schedule card and
from the final round exclusions — a name left on a card is otherwise unexplainable, and a
stale exclusion can leave a finalist with nobody eligible to judge it.

Deleting the last admin is refused. Nothing in the app could add one back.

**History** on a person's row lists the records a role change archived, newest
first, and puts one back. It refuses rather than overwrites when they already
have a record of that role — whatever is there now was made after the archive
was taken, and losing it to a restore is the failure the archive exists to
prevent.

### Joining a team

Only `teams/{id}/name` is readable by somebody who is not yet a member — and
that is exactly who is joining. `submitted` and `members` are member-and-creator
only, so the app **cannot** check "has this team submitted?" or "is it full?"
before attempting the join.

The policy therefore lives where it is enforceable: the write rule on
`teams/{id}/members/{uid}` allows the write only if the person holds a
competitor record and the team has not submitted. `joinTeam` attempts it and
turns a refusal back into a sentence. It still reads the two extra paths
opportunistically — an organizer, or a member rejoining, is allowed — purely to
explain a refusal before the attempt rather than after.

`test/rules/teams.test.mjs` pins the denial, so nothing re-introduces a
dependency on a read that cannot succeed.

### Restore points

Two recovery mechanisms, for different sizes of mistake.

| | Recent activity undo | Restore points |
| --- | --- | --- |
| Holds | one field, inside the log entry | whole subtrees, at `/snapshots` |
| For | a wrong room, name or flag | a bad publish, a wipe, an activation |
| Limit | drops the before-state past 50 KB | none at event scale |
| On drift | refuses, naming the path | overwrites |

The size cap is why restore points exist: the payload for "clear the schedule
and every score" crosses 50 KB at around 25 teams, so the undo was present on
every event small enough to test with and absent on the real one.

One is taken automatically before publishing a schedule, activating the final
round, and anything in the danger zone — and the action is **abandoned** if it
cannot be written. Restoring saves the current state first. Fifteen are kept.

Restoring **overwrites**: anything written since, including scores submitted in
the meantime. It is not a merge.

---

## Judging supply

A judge visits at most one team per batch, so the largest batch —
`ceil(teams / batches)` — sets both limits.

| Rooms | Max teams (3 batches) | Min judges | Judges for a panel of 3 |
| --- | --- | --- | --- |
| 8 | 24 | 8 | 24 |
| 12 | 36 | 12 | 36 |
| 20 | 60 | 20 | 60 |

**Max teams = rooms × batches.** Nothing else caps you.

- **Too few judges** — building the plan refuses and names both fixes: mark
  more, or raise the batch count so fewer teams present at once.
- **Too many judges** — panels cap at 3 (`config/targetJudgesPerTeam`) and the
  rest become spares, rotated so a different group sits out each batch. Keep
  them on hand for no-shows.
- **Batches that do not divide evenly** are the thing to avoid. With 20 teams
  over 3 batches (7/7/6), teams in the smaller batch draw from a better ratio.
  Building the plan says so and names a batch count that divides evenly.

The allocator (`src/user/judge/schedulePlan.js`) guarantees, for every
schedulable event: no judge in two rooms at once, no team without a judge,
panels within a batch differing by at most one, nobody idle while a team is
below target, and judges reshuffled between batches so the same people do not
tour the building together. Asserted across 1–60 teams × 1–40 judges ×
2/3/4/5 batches.

Teams that will be seen by one judge only are **named** in the warning.

---

## Planning a schedule

`/user/admin/schedule`, also reachable as **Plan schedule** (**Plan a new
schedule** once one already exists) on the Judging page.

1. Choose whether to restrict to checked-in judges, then **Build a plan**.
   This reads the event and builds a schedule — it writes nothing.
2. Review it as a grid of batches × rooms, with live numbers above it — panel
   min and max, spares, teams below target, repeat pairings — that update
   after every edit.
3. Hand-edit it: move a team to another batch or free room, or add, remove
   or swap a judge on a team. Every edit is checked, and a refusal names the
   clash: "Ada is already in Rice 011 at 5:00 PM for Team Kestrel in batch 1."
4. **Publish**. It takes a restore point, then writes every assignment in
   ONE atomic update.

The draft lives at `/scheduleDraft`, so it survives a reload or a closed
laptop, and two admins with the page open see each other's edits live.
**Undo** walks the newest edit back, repeatedly, to what the build produced.
**Discard draft** throws the whole thing away. **Rebuild the plan** starts
over from a fresh read of the event and discards every hand edit — it asks
first, naming how many you would lose.

Every hand edit is recorded on the plan and, once published, listed in its
audit log entry, so a schedule that does not match what a fresh build would
have produced is not a mystery later — except a drift-repaired **Drop**,
which deletes the assignment directly rather than going through the edit log
by design, and so will not appear in that summary.

Publishing requires typing a confirmation phrase whenever a schedule might
already exist — including when the check for one fails, which asks rather
than assumes there is nothing to protect. The phrase is `config/eventName`
if it is set (Control panel → Advanced → Write a config key), the team count
otherwise. Set the event name once and everyone types something they can
read instead of a number they have to go look up.

**Publish refuses on drift.** It re-reads what the plan was built from, and
if it moved, refuses and offers a targeted repair instead of making you
rebuild and lose your edits:

| What moved | What you get |
| --- | --- |
| a team submitted since the plan was built | **Place** it into a named free slot |
| a team withdrew | **Drop** it from the plan |
| a judge on a panel lost their round-one mark | **Remove** them from the panel |
| a room the plan uses was removed | **Place** that team into a free room in the same batch |
| batch count or panel target changed | **Rebuild** — the shape of the day changed |

A name change, a batch-times change, or a judge who left but was only a
spare are shown but do not block publishing.

A removed room produces one item **per affected team**, since a room can be
used in several batches. Dropping a team is the one repair **Undo** cannot
walk back, so it asks first.

**A hand-edited or drift-repaired plan no longer carries the allocator's
guarantees.** Panel balance and judge rotation (see Judging supply, above)
are guarantees about *generated* plans — they do not survive arbitrary
editing. Read the stats bar above the grid for what the plan actually looks
like, not what a fresh build would have produced.

The preview also cannot know a room flooded, a judge left early, or that two
teams swapped seats. It removes the surprise from the write. It does not
remove the need to look at the building.

---

## Planning the final round

The Final round tab on `/user/admin/schedule`, or **Plan final round** on the
Judging page.

1. **Build a plan.** Ranks every submitted team on its first-round average,
   cuts the top `config/finalRoundSize` (default 4), and prefills each
   finalist's panel with every eligible judge who did **not** score them in
   round one. It writes nothing.
2. **Correct it.** Reorder the running order, drop a team or add one from the
   ranking, and add, remove or swap judges on any panel. Every edit is checked
   and recorded, and **Undo** walks them back one at a time.
3. **Publish.** Takes a restore point, then writes the standings, every team's
   `finalSlot` and every judge's `finalAssignments` in ONE atomic update.

The draft lives at `/finalRoundDraft`, so it survives a reload and two
admins see each other's edits.

**A judge who scored a team in round one cannot judge it again.** The panel
editor does not offer them and the edit is refused if you ask for it another
way. That is also why seeding at least 8 teams matters: below about six, every
judge sees every team, so every finalist has an empty pool.

**Publish refuses on drift**, the same way the first round's does:

| What moved | What you get |
| --- | --- |
| any ranked team has been scored since the build | **Re-rank** — the averages the cut came from have moved |
| a finalist withdrew | **Drop** it from the plan |
| a judge on a panel is no longer a checked-in round-one judge | **Remove** them |
| the final round room changed in the control panel | **Apply** it — advisory, publishing works either way |

The room comes from `config/finalRoundRoom` and can be overridden on the plan.
It used to be a hardcoded constant, so setting it in the control panel changed
the display and nothing else.

---

## Schema

```
/admins/{uid}              true
/config                    judgingRooms[] batchCount batchTimes eventStart
                           finalRoundRoom targetJudgesPerTeam scheduleMeta
/competitors/{uid}         name, email, major, checkedIn, foodCheckIn, teamId, …
/judges/{uid}              name, email, company, checkedIn, isRound1Judge, …
                           teamAssignments/{teamId}   room time batch judges[]
                           finalAssignments/{teamId}  room timeslot
/teams/{teamId}            name createdBy submitted
                           members/{uid}   true
                           submission      ideaName problemStatement deck…
                           schedule        room time batch judges[]
                           finalSlot       room timeslot
/scores/{round}/{teamId}/{judgeUid}   the rubric, judgeUid, enteredBy, notes
/finalRound                active, teams/{id} (standings), archive/{ts}
/scheduleDraft             the in-progress plan: assignments, basis, edits,
                           version. Admin-only through the root rule — no
                           rule of its own. Deleted on publish
/finalRoundDraft           the in-progress final round: ranked, assignments
                           (order + panel), excluded, pool, edits, basis.
                           Same rule story. Deleted on publish
/adminLog/{entryId}        what changed, with before and after
/snapshotIndex, /snapshots restore points
/archive/people/{uid}/{ts}-{role}   a role record deleted by a role change
```

Four decisions worth knowing:

**Sets are keyed, never arrays.** `members`, `teamAssignments` and
`excludedJudges` are `{id: true}`. Rules match a child *key*, and `hasChild()`
cannot see into an array.

**The schedule is written twice.** Once on the team, once per judge, in one
atomic update. A judge cannot read `/teams`, so they need their own copy.

**Scores live at `/scores`, not under the team.** Rules cascade and cannot be
revoked deeper — a team member's read on their own team would otherwise reach
the judges' notes.

**`judgeUid` is whose card it is; `enteredBy` is who typed it.** `judgeUid` is
pinned to the path key. `enteredBy` is pinned to `auth.uid` for everyone except
admins, which is what lets a restore put a card back with its original
author.

---

## Database rules

`database.rules.json` is the only real authorization. Paste it into the console,
or `firebase deploy --only database`. **Nothing deploys it for you.**

`npm test` fails if the rules change without bumping `// rulesVersion:` — that
failure is the reminder to republish. Do it before the release, not after.

**Current version: 5. Publish it before the event.** Two clauses changed since
version 3: a submitted team is closed to new members, and `enteredBy` is no
longer pinned for admins. Until the second is published, **restoring a
restore point that contains scores fails and changes nothing.**

**Planning a schedule (above) changed nothing here.** `rulesVersion` stays 5
and there is nothing to republish for it. `/scheduleDraft` gets no entry of
its own — it inherits the admin-only root grant the same way every other
un-listed path does — and `src/schema.test.js` asserts it stays that way.

### Who can do what

| Actor | Can |
| --- | --- |
| anyone signed in | read their own record, `config`, `finalRound/active`, any team's `name` |
| competitor | edit own record except check-in; create a team; add or remove themselves from a team that has **not** submitted; read and write their own team's submission |
| judge | read own record and assignments; read submissions for assigned teams; write and read back their own scores |
| admin | everything, via the root rule |

- A judge cannot set their own `isRound1Judge`, `checkedIn` or assignments. That
  last one is load-bearing: the score rules treat an assignment as proof of
  assignment, so seeding one would let a judge score any team.
- A judge can revise a score but not delete one.
- Nobody but an admin can read the standings.
- **There is no team size cap in the rules, and there cannot be.** Realtime
  Database cannot count children — `numChildren()` is a client SDK method, and a
  rule that calls it stops the whole file loading. `MAX_TEAM_SIZE` is advisory.

### Testing

```
npm run test:ci     # 41 suites, 895 tests, no JVM
npm run test:rules  # the rules, against the emulator (needs JDK 17+)
npm run test:e2e    # 45 journeys in a real browser, desktop and phone (needs JDK 17+)
```

### The four layers, and what only the last two can see

| Layer | Runs | Blind to |
| --- | --- | --- |
| Pure logic | the arithmetic, no I/O | anything about the database or the screen |
| Service tests | the shape of each write, database mocked | **permission denials — every read succeeds** |
| Render smoke | each page in jsdom | **layout: jsdom has no viewport** |
| `test:rules` | the real rules engine, as different users | the app |
| `test:e2e` | a real browser, real rules, real routing | nothing above it, but slow |

Three bugs shipped because of the two "blind to" rows: joining a team failed on
a read the rules always refuse, the planner stacked two full-height page frames
so its content sat below the fold, and the room sheets had no link to them. The
e2e specs pin all three.

What the browser layer covers: the two public forms and the hash-URL rewrite; a
competitor joining a team, writing a pitch and uploading a deck; **a judge
opening a card and scoring a team**; an organizer building and publishing a
schedule through its typed confirmation; the final round cut being built,
reordered, undone and published, and the results page refusing to name a winner
while cards are outstanding; restore points being taken and previewed; and the
control panel's mutating controls — adding, renaming and removing a room,
granting admin access, the confirmation a role change puts up, and an export
that produces a file.

Two habits that suite taught, both learned by getting them wrong:

- **Scope every locator to its section.** A page-wide `getByRole("button", {
  name: "Admin" })` matched the nav's own Admin dropdown and opened the menu
  instead of toggling anybody.
- **Wait for the page to settle, do not probe it.** `isVisible()` on a control
  that has not rendered yet returns false and the step is silently skipped.
- **An input's value is not text on the page.** `getByText` cannot see it;
  `toHaveValue` can. A whole afternoon went into that one.
- **Give each scoring spec its own judge.** A card cannot be scored twice, so
  sharing a judge leaves the next spec nothing to submit — and worse, an
  assertion like "a Scored button exists" can pass on a card some *other* spec
  scored. That false positive hid a real bug for a full run.

The suite runs twice over: a **desktop** profile, and a **mobile** one (Pixel 5)
covering the judging journey, the dense organizer pages and both public forms.
The phone specs assert there is no sideways scroll, which is the classic mobile
failure and one jsdom cannot see at all — it has no viewport.

`test:e2e` starts the emulators, seeds an event, and runs the app on port
**3010** — never 3000, and never reusing an existing server. That is deliberate:
Playwright's default would adopt whatever dev server is already running, and if
that one was not started in emulator mode the specs sign in against the **live
project**. A spec that publishes a schedule would then publish it for real.

One wrinkle on Windows: `firebase emulators:exec` sometimes leaves its Java
process holding port 9000, and the next run fails with "port taken". Kill it and
re-run.

| Suite | Pins |
| --- | --- |
| `src/schema.test.js` | rules text: deleted clauses, drifting ranges, `numChildren` reappearing |
| `test/rules/` | rules *behaviour* — executes them and tries the reads |
| `schedulePlan.test.js` | allocator invariants, across every schedulable event |
| `applyFinalEdit.test.js` | the final round edit invariants, across 200 randomised edit walks |
| `finalRoundPlan.test.js` | the cut, the prefill, drift, and what publishing writes |
| `applyEdit.test.js` | the edit invariants, asserted across 200 randomised edit walks |
| `checkDrift.test.js` | blocking vs. advisory drift, and that its live read agrees with the planner about who is in scope |
| `draftStore.test.js` | a stale draft save is refused, naming who moved it |
| `publishPlan.test.js` | a restore point is written before the schedule |
| `snapshotDiff.test.js` | named score loss in a restore diff, by team, judge and round |
| `dangerZone.test.js` | a wipe cannot proceed without a restore point |
| `teamMembership.test.js` | joining a team, including the reads the rules refuse |
| `assignmentEdits.test.js` | moving one judge on the day, and the fan-out to every copy |
| `finalDraftStore.test.js` | the draft's concurrency rule, and the shapes that cross the wire |
| `checkFinalDrift.test.js` | blocking vs advisory drift in the final round, and its repairs |
| `peopleService.test.js` | the one-role switch, its archive copy and the removal fan-out |
| `eventReadiness.test.js` | the phase the event is in, what is blocking, and what to do next |
| `finalStandings.test.js` | the result, and the difference between a running total and one |
| `printableSchedule.test.js` | the paper fallback, grouped by room |
| `ErrorBoundary.test.js` | a thrown page says so instead of going white |
| `roles.test.js` | the profile merge, so a second role cannot blank the first |
| `exportData.test.js` | CSV quoting and formula defusing |
| `resilience.test.js` | the judge outbox surviving a reload |
| `unloadGuard.test.js` | a judge with unsent scores is warned before closing the tab |
| `hashRedirect.test.js` | a path-shaped URL reaching the hash route it meant, in dev and in production |

### The emulator namespace, and why it is what it is

`demo-ideathon-default-rtdb`, pinned in `src/firebase.js`, `scripts/seed-event.mjs`
and `e2e/helpers.mjs`.

It has to be the project's **default instance** and not the bare project id.
`firebase emulators:exec` applies `database.rules.json` to
`<projectId>-default-rtdb` and to nothing else; any other namespace is created
on demand and left **wide open**.

This was wrong for a long time, and it is worth being precise about the damage:
the whole app ran locally with **no authorization at all**. Every read
succeeded, every write succeeded, and no amount of clicking through the app
could reveal a rules bug. `joinTeam` read two paths the rules refuse — it failed
for every real user and worked perfectly against the emulator.

The rules suite was never affected: `test/rules/helpers.mjs` uploads the rules
to the emulator itself via `initializeTestEnvironment`, so it always executed
them. That is why it caught the bug the moment somebody asked it the question.

Two consequences worth knowing:

- Rules **are** enforced in local development now. Something that used to work
  locally may correctly refuse.
- Fixtures written over REST need `Authorization: Bearer owner`, the emulator's
  admin bypass. Without it a write is `auth == null` and gets a 401.

---

## Denormalised copies

Several values are stored in more than one place, because a judge cannot read
`/teams` and a competitor cannot read the standings. Anything that changes one
of them has to reach all of them, and the two rules are not the same:

| Value | Copies | Rule |
| --- | --- | --- |
| Team name | `teams/{id}/name`, `schedule/teamName`, each judge's `teamAssignments` and `finalAssignments`, `finalRound/teams/{id}/name` | **fanned out** on rename |
| Room | `config/judgingRooms`, `schedule/room`, `finalSlot/room`, both sets of judge assignments, `finalRound/teams/{id}/room` | **fanned out** on rename and remap |
| Judge name | `teams/{id}/schedule/judges[].judgeName` | **not** fanned out — every reader resolves from the judge record and treats the cache as a fallback |
| A team's existence | `teams/{id}`, both sets of judge assignments, `finalRound/teams/{id}` | **fanned out** on delete — the results page ranks whatever is in the standings, so a deleted finalist could be shown winning |

The judge name is the odd one out on purpose: it is written into a roster that
is rewritten wholesale by other operations anyway, so a single source of truth
is cheaper than a fan-out. `judgingStatus`, `exportData` and the room sheets all
follow that rule; a new reader must too.

`finalRound/archive` is never rewritten by any of these. It records what the
standings were when the round closed.

## Judge resilience

Judges need no instructions — their side degrades on its own:

- every keystroke is drafted to the device
- a submit that cannot reach the database is queued, not lost
- a hung write times out after eight seconds
- the queue survives a refresh and sends on reconnect

The pitch form is seeded from the database **once per team**, not on every
snapshot. It is a live subscription, so it fires again whenever anything about
the team changes — a teammate joining, an organizer fixing the name, the
schedule being published — and re-seeding on each of those overwrote whatever
the person was in the middle of typing. Somebody writing their problem statement
lost it the moment a teammate pressed Join.

When the queue drains, the cards are re-read. A score that synced in the
background used to land in the database without the judging page noticing: the
card stopped saying "Saved on device" and fell back to "Score team", inviting
the judge to score the same team again and reading, to them, as though their
work had been thrown away. `e2e/offline.spec.mjs` takes the network away from a
real browser and checks both halves — that the card is on disk, and that the
page tells the truth once it lands.

One caveat: **a queued score only syncs while that page is open.** If a judge
closes the tab, the card sits on their device and nobody else can see it, and
Judging progress shows the team as unjudged. The browser's leave warning is
armed whenever something is queued — and only then, since a page that asks "are
you sure?" for nothing teaches people to dismiss it.

---

## Deploying

Served from the `gh-pages` branch at `hoohacks.github.io/IdeaX`.

**Publishing a GitHub Release deploys.** Pushing to `main` does not. Every push
runs CI; only a release builds and pushes to `gh-pages`. There is a
`workflow_dispatch` on the Deploy workflow for when something must go out now.

1. Merge to `main`, let CI go green.
2. If `database.rules.json` changed, publish it. **This release needs v5.**
3. If `storage.rules` changed, publish it. Nothing checks this one, and
   forgetting it silently breaks uploads.
4. Publish a release.

---

## Migrations

Two one-time migrations, both already applied on the current project. Run them
only against a database that predates them.

```
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-team-members.mjs
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-scores.mjs
```

Both are dry-run by default; add `--apply`. `migrate-scores` writes a
timestamped backup to `scripts/backups/` (gitignored — it holds judges' notes)
and reverses with `--rollback <file> --apply`.

**Read the dry run.** Each migration is one atomic update, so a single malformed
record rejects all of it, and Realtime Database will only report
`PERMISSION_DENIED` for the lot.

`READ_LEGACY_SCORE_PATH` in `src/user/judge/getTeamInfo.js` is still `true`, so
pre-migration scores at `teams/{id}/scores` are still read. Set it to `false`
and delete the branches it guards once the migration is verified.

---

## Notes

**Anonymous resume upload.** The registration form uploads the resume before the
account exists, so `storage.rules` allows one unauthenticated write on that
path. Capped at 5 MB and document content types.

**Autofill.** Chrome writes saved profiles into the DOM before React attaches
its listeners, so a controlled form can look full and still refuse to submit.
`src/formKit.js` re-reads the fields on mount, on the `onAutofill` keyframe, on
first focus, and before submitting. If you rename that keyframe, rename it in
`index.css` too.

**The root `CNAME` is inert** — its value contains a path, and it sits outside
`public/`, so the build never copies it. The custom domain is not in use.
