import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { RUBRIC, SCORE_MAX_TOTAL, NOTES_MAX_LENGTH } from "../../judge/scoreRubric";
import { writeScoreOnBehalf } from "../../judge/getTeamInfo";

/**
 * Enter a card on a judge's behalf, from paper or a dead phone.
 *
 * Lives here rather than in JudgingProgress because deleting a score on the
 * Teams page needs it too: a deleted card cannot be restored -- enteredBy is
 * pinned to auth.uid by the rules, which is where "a judge cannot file under
 * another judge" lives -- so the recovery path is re-typing it, which stamps
 * the correct new provenance rather than forging the old one.
 *
 * initialValues and initialJudgeUid are both optional, so the original call
 * site in JudgingProgress is unchanged.
 *
 * `cards` is the team's cards for this round, { judgeUid: card }. Recording
 * under a judge who already has one replaces it -- which is how an organizer
 * corrects a mistyped card -- so the dialog says so before it happens rather
 * than silently writing over a real card when the wrong name is picked.
 */
function PaperScoreDialog({ team, judges, round, cards = {}, initialValues, initialJudgeUid, onClose, onSaved }) {
  const criteria = Object.keys(RUBRIC);
  const [judgeUid, setJudgeUid] = useState(initialJudgeUid ?? "");
  const [values, setValues] = useState({
    ...Object.fromEntries(criteria.map((f) => [f, ""])),
    fundable: "",
    notes: "",
    ...(initialValues ?? {}),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const missing =
    criteria.filter((f) => values[f] === "").length + (values.fundable === "" ? 1 : 0);

  const existing = judgeUid ? cards?.[judgeUid] ?? null : null;
  const existingTotal = existing ? criteria.reduce((s, f) => s + Number(existing[f] || 0), 0) : 0;
  const nameOf = (uid) => {
    const judge = judges.find((j) => j.judgeId === uid);
    return judge?.judgeName ?? judge?.name ?? "This judge";
  };

  async function save() {
    if (busy || missing || !judgeUid) return;
    setBusy(true);
    setError(null);
    try {
      await writeScoreOnBehalf({
        round,
        teamId: team.teamId,
        teamName: team.name,
        judgeUid,
        score: {
          ...Object.fromEntries(criteria.map((f) => [f, Number(values[f])])),
          fundable: values.fundable === "yes",
          notes: values.notes,
          teamName: team.name,
          room: team.room ?? "TBD",
          time: team.time ?? "TBD",
        },
      });
      onSaved(
        existing
          ? `Replaced ${nameOf(judgeUid)}'s score for ${team.name}.`
          : `Recorded a score for ${team.name}.`
      );
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Typography variant="h3" component="div">
          Record a score
        </Typography>
        <Typography variant="body2">{team.name}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.75}>
          <Alert severity="info" sx={{ py: 0.25 }}>
            The score is filed under the judge you pick, and stamped with your account
            as the person who entered it.
          </Alert>

          <TextField
            select
            label="Judge"
            value={judgeUid}
            onChange={(e) => setJudgeUid(e.target.value)}
            fullWidth
          >
            {judges.map((judge) => (
              <MenuItem key={judge.judgeId} value={judge.judgeId}>
                {judge.judgeName ?? judge.name}
                {cards?.[judge.judgeId] ? " (already scored)" : ""}
              </MenuItem>
            ))}
          </TextField>

          {existing && (
            <Alert severity="warning" sx={{ py: 0.25 }}>
              {nameOf(judgeUid)} already filed a card for {team.name} ({existingTotal} /{" "}
              {SCORE_MAX_TOTAL}). Recording replaces it.
            </Alert>
          )}

          {Object.entries(RUBRIC).map(([field, spec]) => (
            <TextField
              key={field}
              select
              label={`${spec.label} (of ${spec.range})`}
              value={values[field]}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
              fullWidth
            >
              {Array.from({ length: spec.range }, (_, i) => String(i + 1)).map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </TextField>
          ))}

          <TextField
            select
            label="Worth funding?"
            value={values.fundable}
            onChange={(e) => setValues((v) => ({ ...v, fundable: e.target.value }))}
            fullWidth
          >
            <MenuItem value="yes">Yes</MenuItem>
            <MenuItem value="no">No</MenuItem>
          </TextField>

          <TextField
            label="Notes (optional)"
            value={values.notes}
            onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
            multiline
            minRows={2}
            fullWidth
            slotProps={{ htmlInput: { maxLength: NOTES_MAX_LENGTH } }}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
        <Typography variant="body2">
          {missing
            ? `${missing} left to fill in`
            : `Total ${criteria.reduce((s, f) => s + Number(values[f] || 0), 0)} / ${SCORE_MAX_TOTAL}`}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={busy} variant="outlined">
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || missing > 0 || !judgeUid} variant="contained">
            {busy ? "Saving…" : existing ? "Replace score" : "Record score"}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

export default PaperScoreDialog;
