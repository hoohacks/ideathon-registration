import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { IoInformationCircleOutline } from "react-icons/io5";

const rubric = {
  problem: {
    label: "Problem",
    range: 10,
    desc: "Does the submission identify and describe an addressable need, want, problem or opportunity in society? Does it identify a target customer base?",
  },
  innovation: {
    label: "Innovation",
    range: 10,
    desc: "Does the submission present a novel, original and compelling solution? Does it describe the alternatives while making a compelling case for how their idea improves on them?",
  },
  impact: {
    label: "Impact",
    range: 10,
    desc: "Does the submission discuss the impact it will make, and how large? How strongly did it cover how stakeholders and potential users could benefit?",
  },
  viability: {
    label: "Viability",
    range: 5,
    desc: "Is the submission feasible, and how hard would it be to implement? How well did it address risks, cost, timeframe or measures of success?",
  },
  pitch_quality: {
    label: "Pitch quality",
    range: 5,
    desc: "How well did they present? Were they confident and professional? Did they have appropriate evidence to support their idea?",
  },
};

const MAX_TOTAL = Object.values(rubric).reduce((sum, f) => sum + f.range, 0);

function Criterion({ field, spec, value, onChange }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Typography variant="body1">{spec.label}</Typography>
        <Tooltip title={spec.desc} enterTouchDelay={0}>
          <Box
            component="span"
            sx={{ display: "flex", color: "text.secondary", cursor: "help", fontSize: "1rem" }}
          >
            <IoInformationCircleOutline />
          </Box>
        </Tooltip>
      </Stack>

      <TextField
        select
        name={field}
        value={value}
        onChange={onChange}
        sx={{ width: 104 }}
        // the maximum sits under the field, so a 5-point criterion cannot be
        // mistaken for a 10-point one at a glance
        helperText={`of ${spec.range}`}
        FormHelperTextProps={{ sx: { textAlign: "right", mr: 0 } }}
      >
        {Array.from({ length: spec.range }, (_, i) => String(i + 1)).map((n) => (
          <MenuItem key={n} value={n}>
            {n}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}

function ScoreSubmission({
  teamName = "Team",
  room = "TBD",
  time = "TBD",
  submitting = false,
  onClose = () => {},
  onSubmit = () => {},
}) {
  const [values, setValues] = useState({
    problem: "5",
    innovation: "5",
    impact: "5",
    viability: "3",
    pitch_quality: "3",
    fundable: "yes",
    notes: "",
  });

  const [busy, setBusy] = useState(false);
  const inFlight = submitting || busy;

  const runningTotal = Object.keys(rubric).reduce(
    (sum, field) => sum + Number(values[field] || 0),
    0
  );

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // the write is async, so without this guard a double click writes twice
    if (inFlight) return;

    const score = {
      problem: Number(values.problem),
      innovation: Number(values.innovation),
      impact: Number(values.impact),
      viability: Number(values.viability),
      pitch_quality: Number(values.pitch_quality),
      fundable: values.fundable === "yes",
      notes: values.notes,
      teamName,
      room,
      time,
    };

    setBusy(true);
    try {
      await onSubmit(score);
    } finally {
      // if the parent failed it keeps the dialog open, so re-enable the button
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={inFlight ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h3" component="div">
          {teamName}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
          <Chip label={time} size="small" variant="outlined" />
          <Chip label={room} size="small" variant="outlined" />
        </Stack>
      </DialogTitle>

      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent dividers sx={{ py: 2 }}>
          <Stack spacing={1.75}>
            {Object.entries(rubric).map(([field, spec]) => (
              <Criterion
                key={field}
                field={field}
                spec={spec}
                value={values[field]}
                onChange={handleChange}
              />
            ))}

            <Divider />

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body1">Worth funding?</Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={values.fundable}
                onChange={(_, next) => next && setValues((v) => ({ ...v, fundable: next }))}
              >
                <ToggleButton value="yes" sx={{ px: 2 }}>
                  Yes
                </ToggleButton>
                <ToggleButton value="no" sx={{ px: 2 }}>
                  No
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <TextField
              name="notes"
              label="Notes (optional)"
              value={values.notes}
              onChange={handleChange}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between" }}>
          <Typography variant="body2">
            Total {runningTotal} / {MAX_TOTAL}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose} disabled={inFlight} variant="outlined">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={inFlight}>
              {inFlight ? "Submitting…" : "Submit score"}
            </Button>
          </Stack>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default ScoreSubmission;
