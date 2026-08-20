import Layout from "./Layout";
import { useContext, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { AuthContext } from "../App";
import { hasRole, roleList } from "../roles";
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";
import { EVENT, EVENT_START } from "../eventInfo";
import { tokens } from "../theme";

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
        <Box sx={{ textAlign: "center", minWidth: { xs: 60, sm: 78 } }}>
            <Typography
                sx={{
                    // the countdown is the display element on this page, so it
                    // is set in the display face rather than the body one
                    fontFamily: tokens.DISPLAY,
                    fontSize: { xs: "2rem", sm: "2.75rem" },
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.05,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {String(value).padStart(2, "0")}
            </Typography>
            <Typography variant="overline" sx={{ display: "block" }}>
                {label}
            </Typography>
        </Box>
    );
}

/**
 * One thing to do next, with the button that does it. An empty page is the one
 * thing a landing screen must not be, and the portal's used to be a countdown
 * on an otherwise blank canvas.
 */
function NextStep({ label, title, body, actions }) {
    return (
        <Card sx={{ height: "100%" }}>
            <CardContent
                sx={{
                    p: 2.5,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    "&:last-child": { pb: 2.5 },
                }}
            >
                <Typography variant="overline" sx={{ display: "block", mb: 0.5 }}>
                    {label}
                </Typography>
                <Typography variant="h5" gutterBottom>
                    {title}
                </Typography>
                <Typography variant="body2" sx={{ mb: 2 }}>
                    {body}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: "auto", flexWrap: "wrap", gap: 1 }}>
                    {actions}
                </Stack>
            </CardContent>
        </Card>
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

    const roles = roleList(userTypes);
    const isCompetitor = hasRole(userTypes, "competitor");
    const isJudge = hasRole(userTypes, "judge");
    const onATeam = Boolean(userData?.teamId);

    const steps = [];

    if (isCompetitor) {
        steps.push(
            onATeam
                ? {
                      key: "team",
                      label: "Your team",
                      title: "Get the pitch ready",
                      body: "Your idea, the problem it solves and your deck all live on the team page. Judges read it before you present.",
                      actions: (
                          <Button variant="contained" component={RouterLink} to="/user/team">
                              Open your team
                          </Button>
                      ),
                  }
                : {
                      key: "team",
                      label: "First thing",
                      title: "Find a team",
                      body: "Nobody pitches alone. Start a team and share the ID, or join one a friend has already made.",
                      actions: (
                          <>
                              <Button variant="contained" component={RouterLink} to="/user/team/create">
                                  Create a team
                              </Button>
                              <Button variant="outlined" component={RouterLink} to="/user/team/join">
                                  Join with an ID
                              </Button>
                          </>
                      ),
                  }
        );
    }

    if (isJudge) {
        steps.push({
            key: "judging",
            label: "On the day",
            title: "Your judging list",
            body: `Teams, rooms and times appear here once the schedule is set. Judging runs ${EVENT.judgingHours}.`,
            actions: (
                <Button variant="contained" component={RouterLink} to="/user/judging">
                    See your assignments
                </Button>
            ),
        });
    }

    if (isCompetitor || isJudge) {
        steps.push({
            key: "checkin",
            label: "When you arrive",
            title: "Your check-in code",
            body: `Show it at the desk in ${EVENT.venue}. It also gets you lunch and dinner.`,
            actions: (
                <Button variant="outlined" component={RouterLink} to="/user/checkin">
                    Show my code
                </Button>
            ),
        });
    }

    return (
        <Layout maxWidth="md">
            <Stack spacing={3}>
                <Box>
                    <Typography variant="h1">
                        Welcome{userData?.firstName ? `, ${userData.firstName}` : ""}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {EVENT.dateLabel} · {EVENT.hours} · {EVENT.venue}
                    </Typography>
                    {roles.length > 0 && (
                        <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: "wrap", gap: 0.75 }}>
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
                    <CardContent sx={{ py: 3.5, "&:last-child": { pb: 3.5 } }}>
                        {time ? (
                            <>
                                <Typography variant="overline" align="center" sx={{ display: "block", mb: 1.5 }}>
                                    Doors open in
                                </Typography>
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
                            </>
                        ) : (
                            <Stack spacing={0.5} alignItems="center">
                                <Typography variant="h2">{EVENT.name} is live</Typography>
                                <Typography variant="body2">
                                    {EVENT.hours} · {EVENT.venue}
                                </Typography>
                            </Stack>
                        )}
                    </CardContent>
                </Card>

                {steps.length > 0 && (
                    <Box
                        sx={{
                            display: "grid",
                            gap: 2,
                            gridTemplateColumns: {
                                xs: "1fr",
                                sm: steps.length > 1 ? "repeat(2, 1fr)" : "1fr",
                            },
                        }}
                    >
                        {steps.map((step) => (
                            <NextStep key={step.key} {...step} />
                        ))}
                    </Box>
                )}
            </Stack>
        </Layout>
    );
}

export default Home;
