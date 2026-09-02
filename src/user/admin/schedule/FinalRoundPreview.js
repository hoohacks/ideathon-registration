import { Fragment, useEffect, useState } from "react";
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from "@mui/material";
import { ConfirmDialog } from "../adminUi.js";
import { planFinalRound, publishFinalRound } from "../../judge/finalRoundService.js";

/**
 * Preview the final round cut before it is written.
 *
 * "Activate final round" used to rank every team, cut the top few, and write
 * the standings plus every judge's final assignments in one press. Nobody
 * saw where the cut fell, which ties were broken to put it there, or which
 * finalists reached the cut on thin evidence, until it was already live.
 *
 * `planFinalRound` builds that cut with no writes; this dialog shows it,
 * lets an organizer override which teams are in by toggling a checkbox per
 * row, and only then hands the confirmed set to `publishFinalRound`. A
 * `staleScores` result -- a card arrived after this plan was built -- refuses
 * the write and offers Re-rank instead of silently publishing on averages
 * that have since moved.
 */
export default function FinalRoundPreview({ open, onClose, onActivated }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  // which ranked teamIds are currently checked in; seeded from the plan's
  // own cut, and from there entirely the organizer's call
  const [included, setIncluded] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [staleScores, setStaleScores] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load() {
    setLoading(true);
    setError(null);
    setStaleScores(null);
    const result = await planFinalRound({});
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setPlan(null);
      return;
    }
    setPlan(result);
    setIncluded(new Set(result.finalists.map((team) => team.teamId)));
  }

  function toggle(teamId) {
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function confirmActivate() {
    setConfirmOpen(false);
    setPublishing(true);
    setStaleScores(null);
    setError(null);

    // rank order, not selection order -- Slot numbering follows this
    const finalists = plan.ranked.filter((team) => included.has(team.teamId));
    const result = await publishFinalRound({ finalists, basis: plan.basis });
    setPublishing(false);

    if (result.ok) {
      onActivated?.(result);
      onClose();
      return;
    }
    if (result.staleScores) {
      setStaleScores(result.staleScores);
      return;
    }
    setError(result.error);
  }

  const cutIndex = plan?.finalists?.length ?? 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Preview the final round cut</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {loading && <Typography variant="body2">Ranking teams…</Typography>}

          {error && <Alert severity="error">{error}</Alert>}

          {staleScores && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={load} disabled={loading}>
                  Re-rank
                </Button>
              }
            >
              {staleScores}
            </Alert>
          )}

          {plan?.warnings?.map((warning) => (
            <Alert severity="warning" key={warning}>{warning}</Alert>
          ))}

          {plan && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Rank</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell align="right">Average</TableCell>
                  <TableCell align="right">Fundable</TableCell>
                  <TableCell align="right">Judges</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plan.ranked.map((team, index) => (
                  <Fragment key={team.teamId}>
                    {index === cutIndex && cutIndex > 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          sx={{ p: 0, borderBottom: "2px solid", borderColor: "text.primary" }}
                        />
                      </TableRow>
                    )}
                    <TableRow selected={included.has(team.teamId)}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={included.has(team.teamId)}
                          onChange={() => toggle(team.teamId)}
                        />
                      </TableCell>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{team.name}</TableCell>
                      <TableCell align="right">{team.averageScore?.toFixed(1)}</TableCell>
                      <TableCell align="right">{team.fundableVotes}</TableCell>
                      <TableCell align="right">{team.judgeCount}</TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!plan || publishing || included.size === 0}
          onClick={() => setConfirmOpen(true)}
        >
          {publishing ? "Activating…" : "Activate"}
        </Button>
      </DialogActions>

      <ConfirmDialog
        open={confirmOpen}
        title="Activate the final round?"
        consequences={[
          "A restore point will be taken first.",
          "Every judge's final assignments are replaced.",
        ]}
        confirmLabel="Activate"
        onConfirm={confirmActivate}
        onCancel={() => setConfirmOpen(false)}
      />
    </Dialog>
  );
}
