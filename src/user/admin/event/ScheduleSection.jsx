import { useEffect, useState } from "react";
import { Button, Card, TextField } from "@mui/material";
import { FIELD, Section, SettingList, SettingRow } from "../adminUi";
import {
  setBatchCount, setBatchTimes, setFinalRoundRoom, setFinalRoundTiming, setJudgesPerTeam,
} from "./eventConfig";
import { formatClockTime, parseClockTime } from "../../judge/clockTime.js";
import {
  BATCH_COUNT,
  BATCH_TIMES,
  MIN_JUDGES_PER_TEAM,
  MAX_JUDGES_PER_TEAM,
  panelLabel,
} from "../../judge/schedulePlan.js";
import { FINAL_ROUND_ROOM } from "../../judge/finalRoundService";

/**
 * A time picker works in "17:30"; the database, like the batch times, holds
 * "5:30 PM", because that is the text teams and judges are shown. A stored
 * value that is not a clock time reads as blank.
 */
function toPicker(stored) {
  const minutes = parseClockTime(stored);
  if (minutes === null) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function fromPicker(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? formatClockTime(Number(match[1]) * 60 + Number(match[2])) : "";
}

/**
 * The shape of judging day.
 *
 * These were module constants and remain so as fallbacks, which is why an empty
 * config renders the built-in values rather than blanks. Everything here feeds
 * the NEXT generation -- a schedule already written keeps the times it was built
 * with, and moving one team is the per-team slot override instead.
 */
export default function ScheduleSection({ config, onResult }) {
  const storedCount = config.batchCount ?? BATCH_COUNT;
  const storedTimes = config.batchTimes ?? BATCH_TIMES;
  const storedRoom = config.finalRoundRoom ?? FINAL_ROUND_ROOM;
  // no built-in default: an unset time shows nothing rather than a guess
  const storedFinalTime = toPicker(config.finalRoundTime);
  const storedSlotMinutes = config.finalRoundSlotMinutes == null ? "" : String(config.finalRoundSlotMinutes);
  const storedMin = config.minJudgesPerTeam ?? MIN_JUDGES_PER_TEAM;
  const storedMax = config.maxJudgesPerTeam ?? MAX_JUDGES_PER_TEAM;

  const [count, setCount] = useState(String(storedCount));
  const [times, setTimes] = useState(storedTimes);
  const [room, setRoom] = useState(storedRoom);
  const [finalTime, setFinalTime] = useState(storedFinalTime);
  const [slotMinutes, setSlotMinutes] = useState(storedSlotMinutes);
  const [minJudges, setMinJudges] = useState(String(storedMin));
  // blank is "no cap", which is how a null max reads back
  const [maxJudges, setMaxJudges] = useState(storedMax == null ? "" : String(storedMax));
  const [busy, setBusy] = useState(false);

  // the database is the source of truth; re-sync when a write lands or another
  // admin changes it in a different tab
  useEffect(() => { setCount(String(storedCount)); }, [storedCount]);
  useEffect(() => { setTimes(storedTimes); }, [storedTimes]);
  useEffect(() => { setRoom(storedRoom); }, [storedRoom]);
  useEffect(() => { setFinalTime(storedFinalTime); }, [storedFinalTime]);
  useEffect(() => { setSlotMinutes(storedSlotMinutes); }, [storedSlotMinutes]);
  useEffect(() => { setMinJudges(String(storedMin)); }, [storedMin]);
  useEffect(() => { setMaxJudges(storedMax == null ? "" : String(storedMax)); }, [storedMax]);

  const run = async (work, message) => {
    setBusy(true);
    try {
      onResult(await work(), message);
    } finally {
      setBusy(false);
    }
  };

  const batches = Array.from({ length: Number(count) || 0 }, (_, i) => i + 1);

  const nextMin = Number(minJudges);
  const nextMax = maxJudges.trim() === "" ? null : Number(maxJudges);
  const panelUnchanged = nextMin === storedMin && nextMax === storedMax;

  return (
    <Section
      title="Judging schedule"
      note="These take effect the next time a schedule is generated. To move a team that is already scheduled, use the team's own slot override."
    >
      <Card sx={{ p: 2.5 }}>
        <SettingList>
          <SettingRow label="Batches" hint="Teams are split into this many presentation rounds.">
            <TextField
              type="number"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              sx={{ width: FIELD.count }}
              // the row's label is the visible one; this is what names the
              // input itself, and it has to go on the htmlInput slot -- on a
              // TextField a bare aria-label lands on the wrapper div, where no
              // screen reader and no test will find it
              slotProps={{ htmlInput: { min: 1, max: 12, "aria-label": "Batches" } }}
            />
            <Button
              variant="outlined"
              disabled={busy || Number(count) === storedCount}
              onClick={() => run(
                () => setBatchCount(Number(count)),
                `Batch count set to ${count}`
              )}
            >
              Save
            </Button>
          </SettingRow>

          {/*
            Saying so, because the field does not.
            These times are read when a schedule is BUILT and copied onto every
            judge's card and every team's page at publish. Changing them later
            moves nothing that is already out there -- and "Batch times saved"
            reads exactly like it did.
          */}
          <SettingRow
            label="Batch times"
            hint="Used when you build a schedule. Cards already published keep the times they were built with; change one on the team's record."
          >
            {batches.map((batch) => (
              <TextField
                key={batch}
                label={`Batch ${batch}`}
                value={times[batch] ?? ""}
                onChange={(event) => setTimes({ ...times, [batch]: event.target.value })}
                placeholder="5:00 PM"
                sx={{ width: FIELD.time }}
              />
            ))}
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() =>
                run(() => setBatchTimes(times), "Batch times saved for the next build")
              }
            >
              Save times
            </Button>
          </SettingRow>

          <SettingRow
            label="Judges per team"
            hint="First round only. Leave the max blank to seat every judge, spread evenly across the rooms. Too few judges for the min still builds, with a warning."
          >
            <TextField
              type="number"
              label="Min"
              value={minJudges}
              onChange={(event) => setMinJudges(event.target.value)}
              sx={{ width: FIELD.count }}
              slotProps={{ htmlInput: { min: 1, "aria-label": "Min judges per team" } }}
            />
            <TextField
              type="number"
              label="Max"
              placeholder="No cap"
              value={maxJudges}
              onChange={(event) => setMaxJudges(event.target.value)}
              sx={{ width: FIELD.count }}
              slotProps={{
                htmlInput: { min: 1, "aria-label": "Max judges per team" },
                inputLabel: { shrink: true }
              }} />
            <Button
              variant="outlined"
              disabled={busy || panelUnchanged}
              onClick={() => run(
                () => setJudgesPerTeam({ min: nextMin, max: nextMax }),
                `Judges per team set to ${panelLabel(nextMin, nextMax)}`
              )}
            >
              Save
            </Button>
          </SettingRow>

          <SettingRow
            label="Final round room"
            hint="Where the finalists present. The first round uses the list above."
          >
            <TextField
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              sx={{ width: FIELD.name }}
              slotProps={{ htmlInput: { "aria-label": "Final round room" } }}
            />
            <Button
              variant="outlined"
              disabled={busy || room === storedRoom}
              onClick={() => run(() => setFinalRoundRoom(room), `Final round room set to ${room}`)}
            >
              Save
            </Button>
          </SettingRow>

          <SettingRow
            label="Final round time"
            hint="When the final round starts, and how long each finalist gets. With both, each finalist sees its own time instead of a slot number. Teams and judges see these live, so a change reaches them straight away. Leave blank to show no time."
          >
            <TextField
              type="time"
              label="Starts"
              value={finalTime}
              onChange={(event) => setFinalTime(event.target.value)}
              sx={{ width: FIELD.time }}
              slotProps={{ htmlInput: { "aria-label": "Final round time" } }}
            />
            <TextField
              type="number"
              label="Min per finalist"
              value={slotMinutes}
              onChange={(event) => setSlotMinutes(event.target.value)}
              sx={{ width: FIELD.count }}
              slotProps={{ htmlInput: { min: 1, max: 120, "aria-label": "Minutes per finalist" } }}
            />
            <Button
              variant="outlined"
              disabled={busy || (finalTime === storedFinalTime && slotMinutes.trim() === storedSlotMinutes)}
              onClick={() => run(
                () => setFinalRoundTiming({
                  time: fromPicker(finalTime),
                  slotMinutes: slotMinutes.trim() === "" ? null : Number(slotMinutes),
                }),
                finalTime ? `Final round time set to ${fromPicker(finalTime)}` : "Final round time cleared"
              )}
            >
              Save
            </Button>
          </SettingRow>
        </SettingList>
      </Card>
    </Section>
  );
}
