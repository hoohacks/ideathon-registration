import { useEffect, useState } from "react";
import { Alert, Button, Divider, MenuItem, TextField, Typography } from "@mui/material";
import EditDrawer from "../control/EditDrawer";
import { renameTeam } from "../recordEdits";
import { overrideTeamSlot, setTeamSubmitted, forceIntoFinalRound } from "../dangerZone";
import { listRooms } from "../roomsService";

/**
 * Everything about one team an organiser may need to change on the day.
 *
 * Each control is its own write, because each has a different fan-out: a rename
 * touches every judge's copy of the name, a slot override touches every
 * assigned judge's room and time, and the submitted flag is a single path. One
 * combined save would make the audit entries useless -- you could not tell
 * which of them the undo was going to reverse.
 */
export default function TeamEditDrawer({ team, teamId, onClose, onResult }) {
  const [name, setName] = useState(team.name ?? "");
  const [room, setRoom] = useState(team.schedule?.room ?? "");
  const [time, setTime] = useState(team.schedule?.time ?? "");
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { listRooms().then(setRooms).catch(() => setRooms([])); }, []);

  const nameDirty = name.trim() !== (team.name ?? "");
  const slotDirty =
    Boolean(team.schedule) &&
    (room !== (team.schedule?.room ?? "") || time !== (team.schedule?.time ?? ""));

  const run = async (work, message) => {
    setSaving(true);
    setError(null);
    try {
      const result = await work();
      if (!result.ok) { setError(result.error); return false; }
      onResult(result, message);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (nameDirty && !(await run(() => renameTeam(teamId, name), `Renamed to ${name.trim()}`))) return;
    if (slotDirty && !(await run(
      () => overrideTeamSlot({ teamId, teamName: name, room, time }),
      `Moved to ${room} at ${time}`
    ))) return;
    onClose();
  };

  return (
    <EditDrawer
      open
      title={team.name || "Unnamed team"}
      subtitle={team.submission?.ideaName}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      dirty={nameDirty || slotDirty}
    >
      <TextField
        label="Team name"
        size="small"
        value={name}
        onChange={(event) => setName(event.target.value)}
        helperText="Also updates the schedule and every judge's copy"
      />

      <Divider />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>First round slot</Typography>

      {team.schedule ? (
        <>
          <TextField select label="Room" size="small" value={room} onChange={(e) => setRoom(e.target.value)}>
            {/* the current room is included even if it is off the list, so an
                override never silently blanks a slot that is already set */}
            {[...new Set([...rooms, room].filter(Boolean))].map((option) => (
              <MenuItem key={option} value={option}>{option}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Time"
            size="small"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            placeholder="5:00 PM"
            helperText={`Batch ${team.schedule.batch ?? "?"} · moves every assigned judge too`}
          />
        </>
      ) : (
        <Alert severity="info">
          This team has no schedule entry. Generate a schedule before overriding a slot.
        </Alert>
      )}

      <Divider />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Submission</Typography>

      <TextField
        select
        label="Submitted"
        size="small"
        value={String(Boolean(team.submitted))}
        onChange={(event) => {
          const submitted = event.target.value === "true";
          run(
            () => setTeamSubmitted({ teamId, teamName: name, submitted }),
            submitted ? "Marked as submitted" : "Marked as not submitted"
          );
        }}
        helperText="Only submitted teams are given judges when a schedule is generated"
      >
        <MenuItem value="true">Yes</MenuItem>
        <MenuItem value="false">No</MenuItem>
      </TextField>

      <Divider />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Final round</Typography>

      <FinalRoundControls team={team} teamId={teamId} name={name} saving={saving} run={run} />
    </EditDrawer>
  );
}

/**
 * Putting one team into the final round by hand. Kept separate because it
 * writes three kinds of path -- the private standings entry, the team's own slot
 * and a copy for each final-round judge -- and none of them is a field edit.
 */
function FinalRoundControls({ team, teamId, name, saving, run }) {
  const [room, setRoom] = useState(team.finalSlot?.room ?? "");
  const [timeslot, setTimeslot] = useState(team.finalSlot?.timeslot ?? "");

  return (
    <>
      {team.finalSlot && (
        <Alert severity="info">
          Already in the final round: {team.finalSlot.room} at {team.finalSlot.timeslot}.
        </Alert>
      )}

      <TextField label="Final round room" size="small" value={room} onChange={(e) => setRoom(e.target.value)} />
      <TextField label="Final round timeslot" size="small" value={timeslot} onChange={(e) => setTimeslot(e.target.value)} />

      <Alert severity="warning">
        This adds the team to the standings and gives it a slot. It does not assign
        judges — do that from the judging progress page.
      </Alert>

      <Button
        variant="outlined"
        disabled={saving || !room.trim() || !timeslot.trim()}
        onClick={() => run(
          () => forceIntoFinalRound({ teamId, teamName: name, room, timeslot }),
          `${name || "Team"} added to the final round`
        )}
      >
        {team.finalSlot ? "Update final round slot" : "Add to the final round"}
      </Button>
    </>
  );
}
