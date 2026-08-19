import Layout from "./Layout";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../App";
import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { EVENT, EVENT_START } from "../eventInfo";

function differenceToTime(target) {
    if (!target || Number.isNaN(target.getTime())) return null;

    const difference = target - new Date();
    if (difference <= 0) return null;

    return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / (1000 * 60)) % 60),
        seconds: Math.floor((difference / 1000) % 60),
    };
}

function Unit({ value, label }) {
    return (
        <Box sx={{ textAlign: "center", minWidth: 64 }}>
            <Typography
                sx={{
                    fontSize: { xs: "1.75rem", sm: "2.25rem" },
                    fontWeight: 650,
                    lineHeight: 1.1,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {String(value).padStart(2, "0")}
            </Typography>
            <Typography variant="body2" sx={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.7rem" }}>
                {label}
            </Typography>
        </Box>
    );
}

function Home() {
    const { userData, userTypes } = useContext(AuthContext);
    const [eventStart, setEventStart] = useState(() => new Date(EVENT_START));
    const [time, setTime] = useState(() => differenceToTime(new Date(EVENT_START)));

    useEffect(() => {
        const unsubscribe = onValue(ref(database, "config/eventStart"), (snapshot) => {
            if (!snapshot.exists()) return;
            const parsed = new Date(snapshot.val());
            if (!Number.isNaN(parsed.getTime())) setEventStart(parsed);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        setTime(differenceToTime(eventStart));
        const interval = setInterval(() => setTime(differenceToTime(eventStart)), 1000);
        return () => clearInterval(interval);
    }, [eventStart]);

    const roles = Array.isArray(userTypes) ? userTypes : [];

    return (
        <Layout maxWidth="sm">
            <Stack spacing={2}>
                <Box>
                    <Typography variant="h1">
                        Welcome{userData?.firstName ? `, ${userData.firstName}` : ""}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {EVENT.dateLabel} · {EVENT.hours} · {EVENT.venue}
                    </Typography>
                    {roles.length > 0 && (
                        <Stack direction="row" spacing={0.75} sx={{ mt: 1.5 }}>
                            {roles.map((role) => (
                                <Chip
                                    key={role}
                                    label={role}
                                    size="small"
                                    variant="outlined"
                                    sx={{ textTransform: "capitalize" }}
                                />
                            ))}
                        </Stack>
                    )}
                </Box>

                <Card>
                    <CardContent sx={{ py: 3, "&:last-child": { pb: 3 } }}>
                        {time ? (
                            <Stack
                                direction="row"
                                spacing={{ xs: 1, sm: 2 }}
                                justifyContent="center"
                                divider={<Box sx={{ borderLeft: 1, borderColor: "divider" }} />}
                            >
                                <Unit value={time.days} label="days" />
                                <Unit value={time.hours} label="hours" />
                                <Unit value={time.minutes} label="min" />
                                <Unit value={time.seconds} label="sec" />
                            </Stack>
                        ) : (
                            <Typography variant="h2" align="center">
                                {EVENT.name} is live
                            </Typography>
                        )}
                    </CardContent>
                </Card>
            </Stack>
        </Layout>
    );
}

export default Home;
