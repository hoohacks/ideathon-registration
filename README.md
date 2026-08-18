# Ideathon Registration

Registration, check-in, team submission and judging for the HooHacks Ideathon.

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
| judge | read their own record and assignments; write `teams/*/scores/{ownUid}` and `scores_final_round/{ownUid}`, and read back only their own |
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
