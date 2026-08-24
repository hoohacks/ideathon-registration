# Ideathon Registration

Registration, check-in, team submission and judging for the HooHacks Ideathon.

## First-time project setup

The Firebase project is `ideathon-2026-d6950`; its config lives in
`src/firebaseConfig.js` and is shared by the app and the scripts.

Four things have to be done in the Firebase console before the app works:

1. **Enable Email/Password auth** (Authentication -> Sign-in method).
2. **Publish the database rules** from `database.rules.json`.
3. **Publish the storage rules** from `storage.rules`. Without these, resume
   and pitch deck uploads fail — and a pitch deck is required to be judged.
4. **Create the first admin by hand.** This one is easy to miss: the rules give
   root access only to uids present under `/admins`, and writing to `/admins`
   itself requires being an admin already. Nothing in the app can break that
   cycle. Register an account normally, copy its uid from the Authentication
   tab, then add this in the Realtime Database console:

   ```
   admins
     └── <that-uid>: true
   ```

   Until that exists, no one can generate a schedule or open any admin page.

### About the anonymous resume upload

The registration form starts uploading a resume the moment the file is picked,
which is before the person has an account, so `storage.rules` has to allow an
unauthenticated write on that one path. It is capped at 5 MB and restricted to
document content types, but it is still an anonymous write endpoint. The
alternative is to hold the file in memory and upload it after
`createUserWithEmailAndPassword` succeeds, which would let that rule require
auth; that has not been done here.

Uploads go to `ideathon-resumes/{eventYear}/{graduationYear}/{file}`. The event
year is a path segment rather than part of the folder name, because a Storage
wildcard has to be a whole segment: the rule used to hardcode
`ideathon-resume-2025` while the form uploaded to the current `EVENT.year`, so
every upload after the 2025 event would have been rejected and the form would
have registered people without the resume they attached. **Republish
`storage.rules` after upgrading**, or resume uploads will fail.

### About autofill

The two registration forms are controlled React forms, and Chrome writes a saved
profile straight into the DOM. If it does that before React attaches its
listeners -- the normal case for a saved password on page load -- no change event
is dispatched, React state stays empty, and the form refuses to submit while
pointing at fields that are visibly full.

`src/formKit.js` fixes that by letting the DOM have the last word: it re-reads
the fields on mount, whenever the `onAutofill` keyframe in `index.css` fires
(the only signal a browser gives that it filled something), on the first focus
inside the form, and immediately before submitting. That last one is the
backstop; the earlier ones exist because a controlled input whose value React has
not seen gets wiped on the next render. If you rename that keyframe, rename it in
both places.

## Schema

```
/admins/{uid}              true
/config                    judgingRooms[]  eventStart
                           scheduleMeta           generatedAt generatedBy teams
                                                  judges onlyCheckedIn
/competitors/{uid}         firstName lastName email major skills learn gender
                           schoolYear uvaSchool resume dietaryRestriction
                           checkedIn foodCheckIn teamId registeredAt
/judges/{uid}              firstName lastName email company withCompany
                           wantsToJudge wantsToMentor skills[] timeslots[]
                           checkedIn foodCheckIn isRound1Judge registeredAt
                           teamAssignments/{teamId}   teamName id room time batch judges[]
                           finalAssignments/{teamId}  teamId teamName room timeslot
/teams/{teamId}            name createdBy submitted
                           members/{uid}          true
                           submission             ideaName problemStatement
                                                  targetIndustry pitchDeckName
                                                  pitchDeckURL
                           schedule               teamName id room time batch judges[]
                           finalSlot              room timeslot
/scores/{round}/{teamId}/{judgeUid}
                           problem innovation impact viability pitch_quality
                           fundable notes teamName room time judgeUid teamId
                           enteredBy source submittedAt
                           round is "first" or "final"
/finalRound                active activatedAt activatedBy
                           teams/{teamId}         name averageScore fundableVotes
                                                  judgeCount timeslot room
                                                  excludedJudges/{uid}
                           archive/{ts}           a previous standings set
```

Some things are deliberate:

**Sets are keyed, never arrays.** `members`, `teamAssignments` and
`excludedJudges` are `{id: true}` / `{id: object}`. Realtime Database stores an
array under numeric keys, so `hasChild(auth.uid)` cannot see into one and a
delete renumbers everything after it. `teamMembers.js` and `assignmentList.js`
read both shapes for records written before this. Because object key order is
not meaningful, `assignmentList` re-sorts by `batch`.

**Timestamps are `serverTimestamp()`,** not formatted strings. They sort, they
range-query, and they do not trust the registrant's clock or timezone.

**The schedule is written twice on purpose.** The same assignment lands in
`teams/{id}/schedule` and in each judge's `teamAssignments`. That is what lets a
judge load their own schedule without read access to every team. Both copies are
written in one atomic update, so they cannot drift.

The final round works the same way, for the same reason plus a sharper one:
`/finalRound/teams` carries every finalist's average score, and Realtime
Database needs read permission *at the node being queried*, so a judge cannot
list the finalists without also being handed the standings. Activation therefore
writes `teams/{id}/finalSlot` for the team and `judges/{uid}/finalAssignments`
for the judge, in the same atomic update as the standings themselves.

**Scores live at `/scores`, not under the team.** Rules cascade and cannot be
revoked deeper, so a team member's read on `teams/$teamId` would grant
everything beneath it — including the judges' free-text notes. Nothing holds a
read anywhere above `/scores/{round}/{teamId}/{judgeUid}`, so the only ways in
are your own card and the admin rule at the root.

**`enteredBy` is who pressed the button; `judgeUid` is whose card it is.** They
differ only when an organiser keys in a score from paper. `judgeUid` is pinned
to the path key and `enteredBy` to `auth.uid`, so a judge still cannot file
under another judge, and an admin can no longer be blocked by their own
validation rule from recording a score on someone's behalf.

Scores are validated by the rules — ranges, types, and no unknown fields.
`src/schema.test.js` asserts those ranges still match `SCORE_FIELDS` and the
scoring form, so the three cannot drift apart silently.

## Database rules

`database.rules.json` holds the Realtime Database rules. Paste it into the
Firebase console (Realtime Database -> Rules) or deploy it with
`firebase deploy --only database`. The console strips the `//` comments.

**Nothing deploys them for you, on purpose.** CI builds and publishes the site;
it does not touch the rules. The failure that creates — changing the rules in
git and never republishing them — is caught by a digest check in
`src/schema.test.js`: edit the rules and `npm test` fails until you bump
`// rulesVersion:` at the top of the file and paste the new digest it prints.
That failure is the reminder to republish. Do it before the release goes out,
not after.

The current version is **3**, which added validation for `/adminLog`. That
block only pins the shape of a log entry — the root admin rule already covered
read and write there — so until the rules are republished the control panel
still works and its entries are simply unvalidated. Republish anyway.

`storage.rules` has no equivalent guard, so it is on the release checklist
below. Forgetting it silently breaks resume and pitch deck uploads.

Two things about Realtime Database rules drive the whole shape of that file:

1. **Rules cascade downward and cannot be revoked.** Granting `.read` at
   `/teams` grants it for every team's `scores` too, no matter what the deeper
   rules say. So there is no blanket `"auth != null"` on `/teams` or
   `/competitors`; access is granted per record instead.
2. **`hasChild(auth.uid)` matches a child *key*, not a value.** Team membership
   is therefore stored as a keyed set:

   ```
   teams/{teamId}/members/{uid} = true
   ```

   If members were an array, Firebase would store it under the keys `0`, `1`,
   `2`, and every `members.hasChild(auth.uid)` check would silently be false.
   `src/user/team/teamMembers.js` reads both shapes so teams created before
   this change still work.

### Who can do what

| Actor | Can |
| --- | --- |
| anyone signed in | read their own `admins`/`judges`/`competitors` record, `config`, `finalRound/active`, `finalRound/activatedAt`, and any team's `name` |
| competitor | read and edit their own record except check-in state; create a team; add or remove *themselves* from a team's members; read their own team, including its `finalSlot`; write their own team's `submission` and `submitted` |
| judge | read their own record and both assignment lists; read `submission` for teams they are assigned to; write `scores/{round}/{teamId}/{ownUid}` for those teams, and read back only their own |
| admin | everything, via the root rule |

Notably:

- A judge cannot set their own `isRound1Judge`, `checkedIn`, `teamAssignments`
  or `finalAssignments`. That last one is load-bearing rather than tidy: the
  score rules treat an entry in either assignment node as proof of assignment,
  so a judge who could seed one at registration could file a score for any team
  in the event.
- A judge can revise a score but not delete one. Admins can, through the root
  rule.
- A competitor cannot check themselves in, seed a `schedule` or `finalSlot` on
  a team they create, or read any score at all.
- **Nobody but an admin can read the standings.** `/finalRound` has no `.read`
  at the node itself, because one there would cascade into `finalRound/teams`
  and hand every signed-in account the top four with their average scores before
  they are announced.

### Testing the rules

The rules are the only real authorization in this app — there is no server, and
every React role check is advisory, since anyone can set `userTypes` in DevTools
and paint an admin page. So they are tested twice over:

| Suite | What it catches | Needs |
| --- | --- | --- |
| `src/schema.test.js` | a clause deleted, a range drifting from the code, scores reappearing under `/teams`, `/finalRound` regaining a `.read` | nothing |
| `test/rules/` | a clause that is *wrong* — it executes the rules against the emulator and actually tries the reads | a JVM |

```
npm test           # everything under src/, no JVM needed
npm run test:rules # executes database.rules.json against the emulator
```

The Realtime Database emulator is a Java jar, so `npm run test:rules` needs a
JDK 17+ on the PATH; `npx firebase setup:emulators:database` pre-downloads it.
For an iterative loop, run `npm run emulators` in one terminal and
`npm run test:rules:watch` in another. CI runs both suites.

The emulator runs under the project id `demo-ideathon`. The `demo-` prefix
makes it fully offline, so a misconfigured test can never reach the real
project.

## Migrating existing teams

Deploying the rules above requires a one-time data migration. Teams created
before the keyed-set change still store `members` as an array, and the rules
cannot see a member inside one, so those teams become unreadable to everyone
except their creator. Run this once, from the repo root, with an account listed
in `/admins`:

```
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-team-members.mjs
```

It reports what it would change and writes nothing. Add `--apply` to commit the
change. On a fresh project there is nothing to migrate and it exits saying so.

## Moving scores off the team node

Scores used to live at `teams/{id}/scores`. Rules cascade, so the read a team
member holds on their own team reached them; a competitor could read their own
judges' numbers and notes through the console. They now live at
`/scores/{round}/{teamId}/{judgeUid}`, which nobody holds a read above.

An event with live data has to be walked across. The rules and the client are
coupled — the write path itself moves — so there is no ordering in which
old-client/new-rules and new-client/old-rules both work. Hence a short
coordinated cutover rather than a compatibility window. Scores are deliberately
**not** dual-written: that doubles the failure surface during a live event and
leaves a divergence to reconcile afterwards.

| Step | Do | To undo |
| --- | --- | --- |
| 0 | Export the whole database from the console. | — |
| 1 | `npm run rules:cutover`, publish the generated `database.rules.cutover.json`. Both score locations are live, so the deployed app keeps working. | republish the previous rules |
| 2 | Deploy this build. It reads and writes `/scores`, and falls back to the old location for reads so historical scores do not appear to vanish. | redeploy the previous `gh-pages` commit |
| 3 | `npm run rules:cutover -- --freeze` and publish that, then run the migration below. The freeze matters: a judge who submits between the migration's read and its write would otherwise be read-missed and then nulled. | `--rollback` (below) |
| 4 | Publish `database.rules.json`. Press **Generate Schedule** once. Delete the fallback: set `READ_LEGACY_SCORE_PATH = false` in `src/user/judge/getTeamInfo.js` and remove the legacy branches it guards. | republish the step 1 rules |
| 5 | Sign in as a real competitor account and confirm the console denies `/scores` and `/finalRound`. | — |

```
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-scores.mjs
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/migrate-scores.mjs --apply
```

**Read the dry run.** The whole migration is one atomic update, so a single
malformed legacy record rejects all of it — and Realtime Database will not tell
you which path failed, only `PERMISSION_DENIED` for the lot. The dry run
validates every record against the rules first and lists any it will skip. It
also reports judges whose `teamAssignments` are still array-shaped, who cannot
score at all until the schedule is regenerated, because `hasChild()` cannot see
into an array.

`--apply` writes a timestamped backup to `scripts/backups/` before touching
anything. To reverse it:

```
ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/migrate-scores.mjs --rollback scripts/backups/scores-....json --apply
```

Those backups contain judges' free-text notes, so the directory is gitignored.

Step 4 is what actually closes the leak. Until then the old location still
exists and the old `/finalRound` read is still granted.

## Configuration

Optional database nodes that change behaviour without a deploy:

| Path | Effect |
| --- | --- |
| `config/judgingRooms` | room names for the first round. **Required — there is no fallback list in the code.** Edit it on the control panel, not by hand. A batch cannot have more teams than there are rooms |
| `config/batchCount` | how many batches teams are split into; falls back to `BATCH_COUNT` |
| `config/batchTimes` | the time each batch presents; falls back to `BATCH_TIMES` |
| `config/finalRoundRoom` | falls back to `FINAL_ROUND_ROOM` |
| `config/eventStart` | ISO timestamp the home page counts down to |
| `config/scheduleMeta` | written by schedule generation, not by hand. It is what makes the "you are about to replace every assignment" confirmation survive a page reload |

All of these are editable on the **control panel**; the table is here so the
paths are findable when something has to be inspected directly.

Note the asymmetry. Batch count, batch times and the final round room keep
built-in fallbacks, because they are structural — an event always has some
number of batches, and a missing node should behave as it always did. Rooms
have none, because there is no sensible default for which rooms a venue booked.
A hardcoded list would mean an organiser who removed the last room watched
twelve reappear at the next generation, unable to tell whether the rooms in use
were chosen or shipped. With no rooms configured, generation stops and says so.

## The control panel

`/user/admin/control` holds the settings that used to need the Firebase
console: the judging rooms, the batch count and times, the final round room,
the event start date, and who counts as an organiser. The Competitors, Judges
and Teams dashboards gained an **Edit** button per row for the rest.

Three things there are worth knowing before the day.

**Judging rooms live only in the database.** There is no built-in list. Add the
rooms the event has booked before generating a schedule, or generation refuses.

**Removing a room a schedule is using is not a list edit.** The room name is
copied into `teams/{id}/schedule` and into every assigned judge's
`teamAssignments`, because a judge cannot read the teams node. Removing such a
room offers to move those teams elsewhere and writes every copy in one atomic
update. Without that, a team walks to a room nobody has listed.

**Every change made here is recorded at `/adminLog`** with the value before and
after, and most can be undone from the Recent activity feed. An undo restores
the recorded value and refuses if anything has moved since, naming the path
that changed rather than quietly discarding someone else's edit.

Two things it deliberately will not do:

- **Create or delete competitors, judges and teams.** The client SDK cannot
  delete a Firebase Auth account, so a "delete" could only remove the database
  record and would leave a working login that resolves to no role.
- **Undo a deleted score.** `enteredBy` is pinned to `auth.uid` by the rules —
  that pin is what stops a judge filing a card under another judge — so nobody
  but the original author could write a card back. Deleting one offers its
  values back for re-entry through the paper score dialog instead, which stamps
  correct new provenance rather than forging the old.

The log is a coordination and forensics aid, not a ledger: admins hold root
write and deletes skip validation, so entries can be erased by anyone who can
write them. It answers "what changed at 4:52", not "prove nobody tampered".

The scanner is deliberately **not** logged. It is the normal high-volume path,
and a feed that is mostly scans is not worth reading. Reversing a check-in from
a dashboard row is an override, and that is recorded.

## Judging

1. Mark first-round judges on **Judge Search**. Only judges flagged
   `isRound1Judge` are given assignments.
2. Press **Generate Schedule** on the Judging page. Teams that submitted are
   split into three batches; each team in a batch gets its own room, and every
   judge visits exactly one team per batch. Generation validates room and judge
   supply first and writes nothing if it cannot produce a complete schedule.
   Tick **only schedule judges who have checked in** to leave no-shows out.
3. Judges score from their assignment cards, which also carry the team's idea,
   problem statement and pitch deck. Scores are keyed by team id.
4. Watch **Judging progress** (Admin -> Judging progress) while the round runs.
5. **Activate Final Round** takes the top four and excludes the judges who
   already saw them in round one.

Scoring is out of 40: problem, innovation and impact are worth 10 each,
viability and pitch quality 5 each. `fundable` is recorded as a tally, not
scored. Nothing is pre-selected on the score card — the form used to open on
5/5/5/3/3/Yes, which meant an untouched card was a complete, submittable score.

### When something goes wrong on the day

**Judging progress** is the page for this. It shows, per team, who is assigned
and who has actually submitted, and per judge, what they still owe. Teams with
no scores sort to the top in red.

| Problem | Do this |
| --- | --- |
| A judge has not turned up | **Judges** on the affected team row -> add or swap. This rewrites one team's assignment, not the whole schedule. Regenerating would move every assignment in the event and strand the scores already collected. |
| A judge's phone died, or they scored on paper | **Record score** on the team row. The card is filed under that judge and stamped with your account in `enteredBy`. |
| A judge says they submitted but nothing shows | Ask whether their page says "saved on this device". Scores that could not reach the database queue on the judge's phone and send themselves on reconnect — the page must stay open. There is a **Retry now** button. |
| A team has no scores and time is running out | Assign a checked-in judge from another room, or record the score yourself. |
| Scores appear from a judge who is not assigned | Expected after a regenerate: scores are keyed by team and judge, so moving an assignment does not move them. Judging progress lists these explicitly, because they still count toward the average. |

Judges do not need to be told any of this. Their side degrades on its own: every
keystroke is drafted to the device, a submit that cannot reach the database is
queued rather than lost, and a hung write times out after eight seconds instead
of spinning forever.

### Picking the winner

`activateFinalRound` sorts on average score and breaks ties explicitly —
fundable votes, then how many judges saw the team, then name. Without that the
last podium place went to whichever team Firebase happened to give the earlier
push key.

It reports, rather than silently swallows, two things worth knowing before the
result is announced: a finalist judged by fewer than two people, and a tie that
straddled the cut line.

Deactivating archives the standings to `finalRound/archive/{timestamp}` instead
of deleting them, and withdraws every judge's `finalAssignments` in the same
update — otherwise judges keep write access to `/scores/final` after the round
has closed.

## Deploying

The site is served from the `gh-pages` branch at
`hoohacks.github.io/ideathon-registration`.

**Publishing a GitHub Release deploys.** Pushing to `main` does not. Every push
and pull request runs CI (unit tests, the rules emulator suite, and a build);
only a published release builds and pushes to `gh-pages`. There is also a
`workflow_dispatch` on the Deploy workflow, which is the handle to reach for
during the event when something has to go out now.

### Release checklist

1. Merge to `main` and let CI go green.
2. If `database.rules.json` changed, publish it in the Firebase console.
   `npm test` will have already forced you to bump `// rulesVersion:`, so the
   diff tells you whether it did.
3. If `storage.rules` changed, publish that too. Nothing checks this one, and
   forgetting it silently breaks resume and pitch deck uploads.
4. Publish a release. The Deploy workflow does the rest.

The root `CNAME` file is inert: its value contains a path, which is not a valid
CNAME value, and it sits outside `public/` so the build never copies it. The
custom domain is not in use.


This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
