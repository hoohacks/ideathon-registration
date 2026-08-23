import { useState } from "react";
import { Alert, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { RowList, Row } from "../adminUi";
import { useAuth } from "../../../App";
import { findPeopleByEmail, grantAdmin, revokeAdmin, revokeGuard } from "../adminsService";

/**
 * Who is an organiser.
 *
 * Granting takes a person found by email rather than a pasted uid: a mistyped
 * uid creates an admin entry belonging to nobody, which cannot be used and
 * still counts toward the last-organiser check that stops a lockout.
 *
 * The guard is enforced in the service too. This only decides what to grey out.
 */
export default function AdminsSection({ admins, onResult }) {
  const { userCredential } = useAuth();
  const currentUid = userCredential?.user?.uid ?? null;

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  const search = async (value) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    setSearching(true);
    try {
      setMatches(await findPeopleByEmail(value));
    } finally {
      setSearching(false);
    }
  };

  const run = async (work, message) => {
    setBusy(true);
    try {
      onResult(await work(), message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <Typography variant="h2" sx={{ fontSize: "1.1rem", mb: 1 }}>Organisers</Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        Only an organiser can write to /admins, so nothing in the app can create the
        first one. Removing the last organiser would lock everyone out permanently —
        it can only be undone in the Firebase console.
      </Alert>

      <TextField
        size="small"
        fullWidth
        placeholder="Find someone by name or email"
        value={query}
        onChange={(event) => search(event.target.value)}
        sx={{ mb: 2 }}
      />

      {query.trim().length >= 2 && (
        <RowList empty={searching ? "Searching…" : "Nobody matches that."}>
          {matches
            .filter((person) => !admins.includes(person.uid))
            .map((person) => (
              <Row key={person.uid}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{person.name}</Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                      {person.email} · {person.roles.join(", ")}
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => run(
                      () => grantAdmin({ uid: person.uid, name: person.name }),
                      `${person.name} is now an organiser`
                    )}
                  >
                    Make organiser
                  </Button>
                </Stack>
              </Row>
            ))}
        </RowList>
      )}

      <Typography variant="body2" sx={{ mt: 2, mb: 1 }}>
        {admins.length} organiser{admins.length === 1 ? "" : "s"}
      </Typography>

      <RowList empty="No organisers. This should be impossible.">
        {admins.map((uid) => {
          const refusal = revokeGuard({ uid, currentUid, adminUids: admins });

          return (
            <Row key={uid}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                    {uid}
                  </Typography>
                  {uid === currentUid && <Chip size="small" label="you" />}
                </Stack>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={busy || Boolean(refusal)}
                  title={refusal ?? undefined}
                  onClick={() => run(() => revokeAdmin(uid), "Organiser access removed")}
                >
                  Remove
                </Button>
              </Stack>
            </Row>
          );
        })}
      </RowList>
    </section>
  );
}
