import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Stack, Typography,
} from "@mui/material";
import { subscribeToSnapshots, restoreSnapshot, captureSnapshot, JUDGING_PATHS } from "../snapshots";

/**
 * The way back from a bulk mistake.
 *
 * The activity feed can undo a field edit, because the before-state fits in the
 * log entry. It cannot undo a regeneration or a full wipe: past
 * UNDO_SIZE_CAP the entry keeps counts only. Restore points hold those
 * before-states out of line, so the size of the event stops deciding whether a
 * mistake is recoverable.
 *
 * One is taken automatically before every bulk action. The button here is for
 * the other case -- taking one deliberately, before doing something manual and
 * risky.
 */
function bytes(value) {
  if (!Number.isFinite(value)) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Date as well as time, unlike the activity feed.
 *
 * The feed is read during the event, where everything happened today and the
 * hour is enough. A restore point can be the one taken before last year's
 * schedule, so the day matters.
 */
function when(value) {
  if (!Number.isFinite(value)) return "";
  return new Date(value).toLocaleString();
}

export default function RestorePointsSection({ onResult }) {
  const [points, setPoints] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);

  // live, so a restore point taken by the danger zone or by a generation shows
  // up here without a reload
  useEffect(() => subscribeToSnapshots(setPoints), []);

  const take = async () => {
    setBusy(true);
    try {
      const result = await captureSnapshot({
        label: `Manual restore point — ${new Date().toLocaleString()}`,
        reason: "taken by hand from the control panel",
        paths: JUDGING_PATHS,
      });
      onResult(result, "Restore point saved");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    const target = confirming;
    setConfirming(null);
    setBusy(true);
    try {
      const result = await restoreSnapshot(target.id);
      onResult(
        result,
        `Restored ${result.restored ?? 0} path(s). The state from before this restore was saved as a new point.`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <Typography variant="h2" sx={{ fontSize: "1.1rem", mb: 1 }}>
        Restore points
      </Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        One is taken automatically before the schedule is generated, before the final round is
        activated, and before anything in the danger zone. Restoring also saves the current
        state first, so you can undo an undo.
      </Alert>

      <Card sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Box>
            <Button variant="outlined" onClick={take} disabled={busy}>
              {busy ? "Working…" : "Take a restore point now"}
            </Button>
          </Box>

          {points.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              None yet. One appears here the first time a schedule is generated.
            </Typography>
          ) : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
              {points.map((point) => (
                <Stack
                  key={point.id}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ sm: "center" }}
                  justifyContent="space-between"
                  sx={{ py: 1.25 }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {point.label ?? point.id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {when(point.at)} · {point.byName ?? point.by} · {bytes(point.bytes)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
                      {(point.paths ?? []).map((path) => (
                        <Chip key={path} label={path} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => setConfirming(point)}
                    sx={{ flexShrink: 0 }}
                  >
                    Restore
                  </Button>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Dialog open={Boolean(confirming)} onClose={() => setConfirming(null)}>
        <DialogTitle>Restore this point?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <p>
              This replaces <strong>{(confirming?.paths ?? []).join(", ")}</strong> with the values
              held in “{confirming?.label}”.
            </p>
            <p>
              Anything written since then is overwritten — including scores judges have submitted
              in the meantime. The current state is saved as a new restore point first, so this is
              reversible.
            </p>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={restore}>
            Restore
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
