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

## Schema

```
/admins/{uid}              true
/config                    judgingRooms[]  eventStart
/competitors/{uid}         firstName lastName email major skills learn gender
                           schoolYear uvaSchool resume dietaryRestriction
                           checkedIn foodCheckIn teamId registeredAt
/judges/{uid}              firstName lastName email company withCompany
                           wantsToJudge wantsToMentor skills[] timeslots[]
                           checkedIn foodCheckIn isRound1Judge registeredAt
                           teamAssignments/{teamId}
/teams/{teamId}            name createdBy submitted
                           members/{uid}          true
                           submission             ideaName problemStatement
                                                  targetIndustry pitchDeckName
                                                  pitchDeckURL
                           schedule               teamName id room time batch judges[]
                           scores/{judgeUid}      problem innovation impact viability
                                                  pitch_quality fundable notes
                                                  teamName room time judgeUid teamId
                                                  submittedAt
                           finalScores/{judgeUid} same shape
/finalRound                active activatedAt activatedBy
                           teams/{teamId}         name averageScore timeslot room
                                                  excludedJudges/{uid}
```

Three things are deliberate:

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

Scores are validated by the rules — ranges, types, and no unknown fields.
`src/schema.test.js` asserts those ranges still match `SCORE_FIELDS` and the
scoring form, so the three cannot drift apart silently.

## Database rules

`database.rules.json` holds the Realtime Database rules. Paste it into the
Firebase console (Realtime Database -> Rules) or deploy it with
`firebase deploy --only database`. The console strips the `//` comments.

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
| anyone signed in | read their own `admins`/`judges`/`competitors` record, `config`, `finalRound`, and any team's `name` |
| competitor | read and edit their own record except check-in state; create a team; add or remove *themselves* from a team's members; read their own team; write their own team's `submission` and `submitted` |
| judge | read their own record and assignments; write `teams/*/scores/{ownUid}` and `finalScores/{ownUid}`, and read back only their own |
| admin | everything, via the root rule |

Notably a judge cannot set their own `isRound1Judge` or `checkedIn`, and a
competitor cannot check themselves in or touch their team's `schedule` or
`scores`.

### Known trade-off

A team member can read their own team node, and scores live under it, so a
determined competitor could read their own team's judge scores and notes
through the console. They cannot read any other team's. Closing this properly
means either moving scores to a top-level `/scores/{teamId}` node or replacing
`$teamId/.read` with per-field read rules and splitting the single subscription
in `src/user/team/Team.js` into one per field. Neither is done here.

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

## Configuration

Two optional database nodes change behaviour without a deploy:

| Path | Effect |
| --- | --- |
| `config/judgingRooms` | list of room names for the first round; falls back to the 12 in `getJudgeSchedule.js`. A batch cannot have more teams than there are rooms |
| `config/eventStart` | ISO timestamp the home page counts down to |

## Judging

1. Mark first-round judges on **Judge Search**. Only judges flagged
   `isRound1Judge` are given assignments.
2. Press **Generate Schedule** on the Judging page. Teams that submitted are
   split into three batches; each team in a batch gets its own room, and every
   judge visits exactly one team per batch. Generation validates room and judge
   supply first and writes nothing if it cannot produce a complete schedule.
3. Judges score from their assignment cards. Scores are keyed by team id.
4. **Activate Final Round** takes the top four teams by average score and
   excludes the judges who already saw them in round one.

Scoring is out of 40: problem, innovation and impact are worth 10 each,
viability and pitch quality 5 each. `fundable` is recorded as a tally, not
scored.


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
