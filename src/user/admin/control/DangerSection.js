import { useEffect, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, Card,
  Stack, TextField, Typography,
} from "@mui/material";
import { IoChevronDown } from "react-icons/io5";
import { clearSchedule } from "../dangerZone";
import { readScheduleMeta } from "../../judge/getJudgeSchedule";

const CONFIRM_WORD = "clear";

/**
 * Collapsed by default, and the one irreversible action asks you to type a word.
 *
 * Clearing the schedule captures every team slot and every judge's assignments
 * -- of the order of 100 KB -- which is past the size at which the audit log
 * keeps a full before-state, so it is recorded as counts only and cannot be
 * undone. Regenerating rebuilds it; the typed confirmation is what stands in
 * for the undo.
 */
export default function DangerSection({ onResult }) {
  const [meta, setMeta] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readScheduleMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  return (
    <section>
      <Accordion
        disableGutters
        elevation={0}
        sx={{ "&:before": { display: "none" }, bgcolor: "transparent" }}
      >
        <AccordionSummary expandIcon={<IoChevronDown />} sx={{ px: 0 }}>
          <Typography variant="h2" sx={{ fontSize: "1.1rem", color: "error.main" }}>
            Danger zone
          </Typography>
        </AccordionSummary>

        <AccordionDetails sx={{ px: 0 }}>
          <Card sx={{ p: 2, borderColor: "error.main", borderWidth: 1, borderStyle: "solid" }}>
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <Typography sx={{ fontWeight: 600 }}>Clear the judging schedule</Typography>
                <Typography variant="body2">
                  Removes every team slot and every judge assignment. Scores are left
                  alone — they are keyed by team and judge, so they survive and
                  re-attach if the same pairing comes back.
                </Typography>
              </Stack>

              {meta && (
                <Alert severity={meta.scoredTeams > 0 ? "warning" : "info"}>
                  Generated for {meta.teams} teams and {meta.judges} judges.
                  {meta.scoredTeams > 0
                    ? ` ${meta.scoredTeams} team(s) already have scores; those cards will be stranded, still counting toward averages while belonging to judges who are no longer assigned.`
                    : " No scores have been filed yet."}
                </Alert>
              )}

              <Alert severity="error">
                This cannot be undone. It is too large for the log to record in full.
              </Alert>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  placeholder={`Type "${CONFIRM_WORD}" to confirm`}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  sx={{ flex: 1 }}
                />
                <Button
                  variant="contained"
                  color="error"
                  disabled={busy || confirm.trim().toLowerCase() !== CONFIRM_WORD}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await clearSchedule();
                      onResult(result, "Schedule cleared");
                      if (result?.ok) {
                        setConfirm("");
                        setMeta(null);
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Clearing…" : "Clear schedule"}
                </Button>
              </Stack>
            </Stack>
          </Card>
        </AccordionDetails>
      </Accordion>
    </section>
  );
}
