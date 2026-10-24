# Deployment

The app is served from the `gh-pages` branch at `hoohacks.github.io/idea-x`.

## Releasing

**Publishing a GitHub Release deploys.** Merging to `main` does not. CI runs on
**pull requests only**, so a direct push to `main` runs nothing; merging through a
PR is what closes that gap. Both workflows can also be run by hand from the
Actions tab.

1. Open a PR, let CI go green, merge.
2. Publish a release.

The deploy job runs the unit and rules tests again before building, so a red
suite never ships. It then deploys the database and storage rules, publishes the
site, and records the rules version. Its summary says whether registration is
open and which rules version went out.

### Discord notices

After each release, a second job posts the result to the team's Discord: live or
failed, the version, who released it, whether registration is open, and links to
the site and the run. It reads the webhook from the `DISCORD_WEBHOOK_URL`
repository secret and quietly does nothing if that is not set. Manual redeploys
from the Actions tab are not announced.

## Publishing the database rules

`database.rules.json` is the only real authorization. Every deploy publishes it
and `storage.rules` from the same ref as the site, before the site goes out, so a
failed rules deploy ships nothing.

The file starts with a `// rulesVersion:` number. After the site is published,
the workflow records that number at `config/rulesVersion`. The organizer
dashboard compares it with the version the app needs and shows a red warning
until they match, because the app cannot read the deployed rules itself. See
[security rules](security-rules.md#versioning).

The workflow needs two repository settings: the `GCP_SA_KEY` secret, the JSON key
of a service account that can deploy rules and write the database (the Firebase
Admin role covers both), and the `FIREBASE_PROJECT` variable, the project id. If
recording the version fails, the release still goes out and the run shows a
warning saying what to set by hand.

## First-time Firebase setup

Only needed once per project.

1. Enable **Email/Password** sign-in.
2. Set the `GCP_SA_KEY` secret and `FIREBASE_PROJECT` variable (above). The first
   release then publishes `database.rules.json` and `storage.rules`.
3. **Create the first admin by hand.** Register an account (use
   `#/judge-registration?staff` if registration is closed), copy its uid from the
   Authentication tab, then add `admins/<uid>: true` in the database.

Step 3 cannot be done in the app: writing `/admins` requires already being an
admin. Every later organizer is granted admin from the control panel.

## Opening registration

Registration is closed by default: a build with nothing set closes both sign-up
forms. Sign-in is never closed, so people who already registered can always get
in. To open registration, set the repository variable `REGISTRATION_OPEN` to
`true` (Settings, Secrets and variables, Actions, Variables), then run Deploy. To
close it again, before the event, set it to anything else and redeploy. No code
change is needed.

The deploy workflow hands it to the build as `VITE_REGISTRATION_OPEN`. This is a
build-time flag, not a database setting. See
[ADR 0005](decisions/0005-registration-window-is-a-build-flag.md) for why, and for
why it is not security.

## Deploying from a laptop

`npm run deploy` builds and pushes `build/` to `gh-pages` from your machine,
skipping the tests, the rules deploy and the Discord notice, so prefer the
workflow. Registration is closed in that build unless you open it:

```
npx cross-env VITE_REGISTRATION_OPEN=true npm run deploy
```

## The address

**Pages URLs do not redirect on rename.** The old `/ideathon-registration/` and
`/IdeaX/` addresses are dead. There is deliberately no custom domain; see
[ADR 0009](decisions/0009-no-custom-domain.md) before adding one.
