import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { PiPresentationChart } from "react-icons/pi";
import { database } from "../../firebase";

/**
 * A team's published pitch times, read live.
 *
 * Only the two nodes the card shows, not the whole team: the home page has no
 * other use for the submission or the member list. Both are written onto the
 * team by the publish (schedule) and the final round activation (finalSlot).
 */
export function useTeamPitch(teamId) {
    const [schedule, setSchedule] = useState(null);
    const [finalSlot, setFinalSlot] = useState(null);

    useEffect(() => {
        setSchedule(null);
        setFinalSlot(null);
        if (!teamId) return undefined;
        const unsubscribers = [
            onValue(ref(database, `teams/${teamId}/schedule`), (snapshot) => setSchedule(snapshot.val() ?? null)),
            onValue(ref(database, `teams/${teamId}/finalSlot`), (snapshot) => setFinalSlot(snapshot.val() ?? null)),
        ];
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, [teamId]);

    return { schedule, finalSlot };
}

const ORDINALS = ["1st", "2nd", "3rd"];
const ordinal = (n) => ORDINALS[n - 1] ?? `${n}th`;

/**
 * A final round slot is written as "Slot 2" -- a running order, not a clock
 * time -- so "You pitch at Slot 2" read as a typo. A slot an organizer typed
 * by hand ("6:10 PM") is still a time and keeps the "at".
 */
function when(time) {
    const slot = /^Slot (\d+)$/.exec(String(time ?? "").trim());
    if (slot) return { lead: "You pitch ", value: ordinal(Number(slot[1])) };
    return { lead: "You pitch at ", value: time };
}

/** "You pitch at 5:00 PM in Rice 340." with the time and room in bold. */
function PitchLine({ label, time, room }) {
    const { lead, value } = when(time);
    return (
        <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1.5 }}>
            <Box aria-hidden sx={{ fontSize: 24, lineHeight: 0, mt: 0.25, color: "primary.main" }}>
                <PiPresentationChart />
            </Box>
            <Box>
                {label && (
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {label}
                    </Typography>
                )}
                <Typography sx={{ fontSize: { xs: "1.25rem", sm: "1.5rem" }, fontWeight: 600, lineHeight: 1.3, color: "text.primary" }}>
                    {lead}<Box component="span" sx={{ fontWeight: 800 }}>{value}</Box> in{" "}
                    <Box component="span" sx={{ fontWeight: 800 }}>{room}</Box>.
                </Typography>
            </Box>
        </Stack>
    );
}

/**
 * When and where the team pitches, as the sentence a team repeats to itself on
 * the day, not two chips to decode. Nothing at all until something is
 * published, so it never takes space from a page that has no answer yet.
 */
export default function PitchCard({ schedule, finalSlot }) {
    if (!schedule && !finalSlot) return null;
    return (
        <Card sx={{ borderRadius: 4, border: 2, borderColor: "primary.main" }}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3 }, "&:last-child": { pb: { xs: 2.5, sm: 3 } } }}>
                <Stack spacing={1.25}>
                    {schedule && (
                        <PitchLine label={finalSlot ? "First round" : null} time={schedule.time} room={schedule.room} />
                    )}
                    {finalSlot && (
                        <PitchLine label="Final round" time={finalSlot.timeslot} room={finalSlot.room} />
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}
