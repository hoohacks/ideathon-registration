# 0005. The registration window is a build-time flag

Status: accepted

## Context

The site goes live weeks before the event, and registration should stay closed
until organizers are ready. The obvious place for the switch, a `config` key, is
only readable when signed in, so a logged-out visitor, the very person who needs
to know, could never read it.

## Decision

Whether registration is open is baked into the build from the repository
variable `REGISTRATION_OPEN` (`src/registrationWindow.js`). A build with nothing
set is closed. It gates only the two sign-up forms: sign-in is always open, so
people who already registered can get in after sign-ups close. The judge form
keeps a `?staff` entrance so organizers can still make accounts; the competitor
form has none.

## Consequences

- Opening or closing registration needs a deploy, but no code change.
- It hides the forms; it is **not security**. Someone who forced an account into
  existence would hold no role and see nothing, which the rules guarantee.
- Local development opens it regardless, through the start scripts.
