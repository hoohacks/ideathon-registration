import { useEffect, useState } from "react";
import { Button, Card, Stack, TextField, Typography } from "@mui/material";
import { setEventStart } from "./eventConfig";
import { EVENT_START } from "../../../eventInfo";

/**
 * The event start.
 *
 * The countdown on the home page reads config/eventStart when it is set and
 * falls back to EVENT_START in eventInfo.js, so the date can move without a
 * deploy. The input is datetime-local, which speaks the same
 * "YYYY-MM-DDTHH:mm" the constant already uses.
 */
export default function EventSection({ config, onResult }) {
  const stored = config.eventStart ?? EVENT_START;
  const [value, setValue] = useState(String(stored).slice(0, 16));
  const [busy, setBusy] = useState(false);

  useEffect(() => { setValue(String(stored).slice(0, 16)); }, [stored]);

  return (
    <section>
      <Typography variant="h2" sx={{ fontSize: "1.1rem", mb: 1 }}>Event</Typography>

      <Card sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            size="small"
            type="datetime-local"
            label="Starts"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="Drives the countdown on the home page"
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            disabled={busy || value === String(stored).slice(0, 16)}
            onClick={async () => {
              setBusy(true);
              try {
                onResult(await setEventStart(`${value}:00`), "Event start saved");
              } finally {
                setBusy(false);
              }
            }}
            sx={{ mt: 0.5 }}
          >
            Save
          </Button>
        </Stack>
      </Card>
    </section>
  );
}
