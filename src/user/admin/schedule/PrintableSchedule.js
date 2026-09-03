import { useEffect, useMemo, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { onValue, ref } from "firebase/database";
import { database } from "../../../firebase";
import { EVENT } from "../../../eventInfo";

/**
 * The schedule on paper, one sheet per room.
 *
 * The README already treats "a judge scored on paper" as an ordinary event-day
 * occurrence and there is a Record score flow for it -- but nothing printed, so
 * the paper fallback started with somebody copying a screen by hand. When the
 * wifi in Rice Hall does what wifi does, the thing that keeps judging running is
 * a sheet per room listing the batch, the time, the team and the panel.
 *
 * A room is the unit rather than a batch, because a judge stays in a room and
 * teams rotate through it: one sheet, taped to one door, covers the whole
 * evening for whoever is in there.
 *
 * Print styling lives in `@media print` at the bottom rather than in the theme:
 * this is the only page that has a paper form, and everything a screen needs --
 * the app chrome, the print button itself -- is exactly what paper does not.
 */
export default function PrintableSchedule() {
  const [teams, setTeams] = useState({});
  const [config, setConfig] = useState({});

  useEffect(() => {
    const stop = [
      onValue(ref(database, "teams"), (s) => setTeams(s.val() ?? {})),
      onValue(ref(database, "config"), (s) => setConfig(s.val() ?? {})),
    ];
    return () => stop.forEach((fn) => fn());
  }, []);

  const rooms = useMemo(() => byRoom(teams), [teams]);
  const batchTimes = config.batchTimes ?? {};

  return (
    <Box sx={{ p: { xs: 2, sm: 4 }, bgcolor: "background.paper", minHeight: "100vh" }}>
      <Stack
        className="no-print"
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ mb: 3, flexWrap: "wrap", gap: 1 }}
      >
        <Typography variant="h1" sx={{ flex: 1 }}>
          Room sheets
        </Typography>
        <Button variant="contained" onClick={() => window.print()}>
          Print
        </Button>
      </Stack>

      {rooms.length === 0 ? (
        <Typography variant="body2" className="no-print">
          Nothing to print yet — no team has a room. Publish a schedule first.
        </Typography>
      ) : (
        rooms.map((room) => (
          <Box key={room.name} className="sheet" sx={{ mb: 6 }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="baseline"
              sx={{ borderBottom: 2, borderColor: "text.primary", pb: 1, mb: 1.5 }}
            >
              <Typography variant="h2">{room.name}</Typography>
              <Typography variant="body2">
                {EVENT.name} {EVENT.year} · judging {EVENT.judgingHours}
              </Typography>
            </Stack>

            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
              <Box component="thead">
                <Box component="tr">
                  {["Batch", "Time", "Team", "Judges", "Score out of 40"].map((head) => (
                    <Box
                      key={head}
                      component="th"
                      sx={{
                        textAlign: "left",
                        py: 0.75,
                        pr: 1.5,
                        borderBottom: 1,
                        borderColor: "divider",
                        typography: "overline",
                      }}
                    >
                      {head}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box component="tbody">
                {room.slots.map((slot) => (
                  <Box component="tr" key={`${slot.batch}-${slot.teamId}`}>
                    <Cell data>{slot.batch ?? "—"}</Cell>
                    <Cell data>{slot.time ?? batchTimes[slot.batch] ?? "—"}</Cell>
                    <Cell>{slot.teamName}</Cell>
                    <Cell>{slot.judges.join(", ") || "—"}</Cell>
                    {/* deliberately blank: this column is why the sheet exists */}
                    <Cell />
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        ))
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sheet { page-break-after: always; }
          .sheet:last-child { page-break-after: auto; }
          body { background: #fff; }
        }
      `}</style>
    </Box>
  );
}

function Cell({ children, data = false }) {
  return (
    <Box
      component="td"
      sx={(t) => ({
        py: 1,
        pr: 1.5,
        borderBottom: 1,
        borderColor: "divider",
        verticalAlign: "top",
        minWidth: children ? undefined : 110,
        ...(data ? t.typography.data : { fontSize: "0.875rem" }),
      })}
    >
      {children}
    </Box>
  );
}

/**
 * Teams grouped by the room they present in, each room's slots in batch order.
 * Exported for the test: the grouping is the whole of the logic here.
 */
export function byRoom(teams = {}) {
  const rooms = new Map();

  for (const [teamId, team] of Object.entries(teams)) {
    const schedule = team?.schedule;
    if (!schedule?.room) continue;

    const raw = schedule.judges;
    const roster = Array.isArray(raw) ? raw : Object.values(raw ?? {});

    if (!rooms.has(schedule.room)) rooms.set(schedule.room, []);
    rooms.get(schedule.room).push({
      teamId,
      teamName: team?.name ?? "Unnamed team",
      batch: schedule.batch ?? null,
      time: schedule.time ?? null,
      judges: roster.filter(Boolean).map((entry) => entry.judgeName ?? entry.judgeId),
    });
  }

  return [...rooms.entries()]
    .map(([name, slots]) => ({
      name,
      slots: slots.sort((a, b) => (a.batch ?? 0) - (b.batch ?? 0)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
