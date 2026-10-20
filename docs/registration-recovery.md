# Registration rollback and profile recovery

Registration creates an Auth account, then writes its competitor or judge
profile. If that write rejects, the form awaits Firebase's modular
`deleteUser(user)` API for the newly created account. Successful rollback keeps
all answers, including the password, and allows submission with the same email.
A failed rollback offers a link to complete the profile after reconnecting.
Recovery never creates or deletes an Auth account.

A signed-in account with no profile can choose student or judge/mentor
registration from Profile. The form uses the existing UID and email, omits the
password, and refreshes the session's profile and roles after saving. Recovery
remains available when public registration is closed. Failed profile lookups
show a retry action instead of assuming the account is incomplete.

## Verification

Run `npm run test:ci` for the registration rollback/retry tests and profile
recovery tests. Run the existing emulator browser suite with:

```sh
npm run test:e2e
```

The registration browser spec includes a real rules rejection followed by
successful re-registration with the same email. It also creates an Auth-only
account through the emulator, signs in through the app, and verifies that
profile completion writes to that account's original UID. Rules are unchanged.
Java 21 or newer is required by the Firebase CLI; ports 9000, 9099 and 9199
must be free.

## Manual emulator walkthrough

1. Run `npm run emulators` and, in another terminal, `npm run start:emulator`.
   Open the local app under `/idea-x/`.
2. Fill student registration with a new email. In browser developer tools,
   place a breakpoint immediately before the profile `update()` call, after
   Auth creation has succeeded.
3. To verify successful rollback deterministically, change
   `applicant.checkedIn` to `true` in the paused debugger. The existing rules
   reject this value. Resume and verify that the retry alert appears and all
   answers remain. Submit again without altering the values: registration
   should succeed with the same email. For the judge form, change
   `judge.checkedIn` instead.
4. To exercise an interrupted connection, pause at the same point, disconnect
   the browser, and resume. Firebase may keep the write pending while offline
   rather than reject it immediately. Reconnect and observe whether the write
   finishes; do not interpret a pending write as a rejected write.
5. To verify recovery after both operations reject, the unit tests inject
   errors into the database write and Auth deletion. For a manual recovery
   check, create an Auth-only account in the Auth emulator, then sign in to
   the app. The app should direct you to Profile with both registration
   choices. Complete one form and verify that the database record uses the
   existing Auth UID, and that Profile displays the saved details.
6. Repeat profile completion for a judge/mentor, and reload after completion
   to confirm that the saved role persists.

The Auth and database operations cannot be made atomic by this client-only
app. Rollback handles rejected writes; recovery handles accounts left behind
when rollback cannot finish.
