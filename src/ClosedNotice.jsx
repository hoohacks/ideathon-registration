import { Box, Button, Stack } from "@mui/material";
import { EVENT } from "./eventInfo";
import { Hero, PublicShell } from "./registrationUi";

/**
 * What the public sees on a sign-up form while registration is closed.
 *
 * The site is live both before sign-ups open and after they close, so this
 * says only that the form is closed, not which side of the window we are on,
 * and points people who already registered at sign-in, which is never closed.
 * That beats presenting a form that would not work or a page that looks broken.
 *
 * It is deliberately the same shell as the forms it replaces: somebody who
 * comes back when it opens should recognise the page, not wonder whether they
 * are on the right site.
 */
export default function ClosedNotice({ what = "Registration" }) {
  return (
    <PublicShell>
      <Hero
        eyebrow={`${EVENT.name} ${EVENT.year}`}
        title={`${what} is closed`}
        facts={[EVENT.dateLabel, EVENT.hours, EVENT.venue]}
      >
        We are not taking new sign-ups right now. If you already registered,
        your account still works and you can sign in as usual.
      </Hero>

      <Box sx={{ pb: 8 }}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button variant="contained" href="#/login">
            Sign in
          </Button>
          <Button variant="outlined" href={EVENT.siteUrl}>
            About the event
          </Button>
        </Stack>
      </Box>
    </PublicShell>
  );
}
