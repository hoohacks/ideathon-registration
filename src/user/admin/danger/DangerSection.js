import { useEffect, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, Card, Checkbox,
  FormControlLabel, Stack, TextField, Typography,
} from "@mui/material";
import { IoChevronDown } from "react-icons/io5";
import { clearSchedule } from "./dangerZone";
import { readScheduleMeta } from "../../judge/scheduleConfig";

const CONFIRM_WORD = "clear";

/**
 * Collapsed by default, and the destructive action asks you to type a word.
 *
 * Clearing the schedule captures every team slot and every judge's assignments,
 * which is past the size at which the audit log keeps a full before-state -- so
 * the feed records counts only and cannot undo it. A restore point is taken
 * first instead, and the action refuses outright if that restore point cannot
 * be written. The typed confirmation stops the click; the restore point is what
 * makes the click survivable.
 */
export default function DangerSection({ onResult }) {
  const [meta, setMeta] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [includeScores, setIncludeScores] = useState(false);
  const [busy, setBusy] = useState(false);

  // a different word for the destructive version, so a click-through that was
  // already typed out cannot carry over into deleting every score
  const confirmWord = includeScores ? "delete scores" : CONFIRM_WORD;

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
                  Removes every team slot and every judge assignment. Scores are kept
                  by default — they are keyed by team and judge, so they survive and
                  re-attach if the same pairing comes back.
                </Typography>
              </Stack>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeScores}
                    onChange={(event) => {
                      setIncludeScores(event.target.checked);
                      // the confirmation word changes with the checkbox; clear
                      // anything already typed so it has to be typed again
                      setConfirm("");
                    }}
                  />
                }
                label="Also delete every score — start completely from scratch"
              />

              {includeScores && (
                <Alert severity="error">
                  Every score in the event will be deleted, in both rounds, including
                  the pre-migration copies stored on the team nodes. Nothing keeps a
                  copy: Realtime Database has no history, and this is far past the
                  size the audit log can record for an undo. Judges would have to
                  score every team again from nothing.
                </Alert>
              )}

              {meta && (
                <Alert severity={meta.scoredTeams > 0 ? "warning" : "info"}>
                  Generated for {meta.teams} teams and {meta.judges} judges.
                  {meta.scoredTeams === 0
                    ? " No scores have been filed yet."
                    : includeScores
                      // saying "stranded" here would be wrong: with the box
                      // ticked those cards are not orphaned, they are deleted
                      ? ` ${meta.scoredTeams} team(s) have scores. All of them will be deleted.`
                      : ` ${meta.scoredTeams} team(s) already have scores; those cards will be stranded, still counting toward averages while belonging to judges who are no longer assigned.`}
                </Alert>
              )}

              <Alert severity="error">
                This cannot be undone. It is too large for the log to record in full.
              </Alert>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  placeholder={`Type "${confirmWord}" to confirm`}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  sx={{ flex: 1 }}
                />
                <Button
                  variant="contained"
                  color="error"
                  disabled={busy || confirm.trim().toLowerCase() !== confirmWord}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await clearSchedule({ includeScores });
                      onResult(
                        result,
                        includeScores ? "Schedule and every score cleared" : "Schedule cleared"
                      );
                      if (result?.ok) {
                        setConfirm("");
                        setIncludeScores(false);
                        setMeta(null);
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy
                    ? "Clearing…"
                    : includeScores
                      ? "Clear schedule and scores"
                      : "Clear schedule"}
                </Button>
              </Stack>
            </Stack>
          </Card>
        </AccordionDetails>
      </Accordion>
    </section>
  );
}
