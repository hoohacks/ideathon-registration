import Layout from "../Layout";
import React, { useState } from "react";
// qr
import { useZxing } from "react-zxing";
// firebase
import { database } from "../../firebase";
import { ref, get, update } from "firebase/database";
import { Box, Container, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { tokens } from "../../theme";

/**
 * The check-in desk.
 *
 * This is the one page in the portal that runs dark and edge to edge, and the
 * reason is the room rather than the taste: it is held at arm's length, on a
 * phone, in a lobby, by someone reading it between two people in a queue. A
 * camera feed wants a dark surround, and the verdict has to be legible in the
 * half second before the next person steps up -- so the result covers the frame
 * in one colour and one sentence rather than opening a tidy little dialog.
 *
 * It used to be raw markup with Material-blue buttons and a hand-built modal,
 * the last page that never made it into the theme.
 */

const OUTCOMES = {
    success: { tone: "#15803d", title: "Checked in" },
    repeat: { tone: "#b45309", title: "Already done" },
    missing: { tone: tokens.ACCENT, title: "Not found" },
    error: { tone: tokens.ACCENT, title: "Check-in failed" },
};

// how long the verdict stays up, and how long decoding stays paused with it
const HOLD_MS = 2500;

function AdminScan() {
    const [paused, setPaused] = useState(false);
    const [result, setResult] = useState(null);
    const [checkinType, setCheckinType] = useState("event");

    const field = checkinType === "event" ? "checkedIn" : "foodCheckIn";

    const { ref: videoRef } = useZxing({
        async onDecodeResult(decodeResult) {
            const userId = decodeResult.getText();
            if (!userId) return;

            // pause the decoding so it doesn't rapid-scan and break
            setPaused(true);

            try {
                // could be either a judge or a competitor
                const [competitor, judge] = await Promise.all([
                    get(ref(database, `competitors/${userId}`)),
                    get(ref(database, `judges/${userId}`)),
                ]);

                const snapshot = competitor.exists() ? competitor : judge.exists() ? judge : null;

                if (!snapshot) {
                    setResult({
                        kind: "missing",
                        name: "No competitor or judge holds that code",
                        detail: userId,
                    });
                    return;
                }

                const person = snapshot.val();
                const role = competitor.exists() ? "competitors" : "judges";
                const name = `${person.firstName} ${person.lastName}`;

                if (person[field] === true) {
                    setResult({
                        kind: "repeat",
                        name,
                        detail:
                            checkinType === "event"
                                ? "Already checked in for the event"
                                : "Already collected food",
                    });
                    return;
                }

                await update(ref(database, `${role}/${userId}`), { [field]: true });
                setResult({
                    kind: "success",
                    name,
                    detail: checkinType === "event" ? "Event check-in" : "Food check-in",
                });
            } catch (err) {
                console.error("Check-in failed:", err);
                setResult({
                    kind: "error",
                    name: "That did not save",
                    detail: "Scan again, or check them in by hand from Competitors.",
                });
            } finally {
                setTimeout(() => {
                    setPaused(false);
                    setResult(null);
                }, HOLD_MS);
            }
        },
        constraints: {
            // rear camera on phones
            video: { facingMode: "environment" },
            audio: false,
        },
        // zxing pauses decoding and the video on this flag
        paused,
    });

    const outcome = result ? OUTCOMES[result.kind] : null;

    return (
        <Layout bleed>
            <Box
                sx={{
                    flex: 1,
                    bgcolor: tokens.NIGHT,
                    color: tokens.ON_NIGHT,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <Container
                    maxWidth="sm"
                    sx={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2.5,
                        py: { xs: 3, sm: 4 },
                    }}
                >
                    <Box sx={{ textAlign: "center" }}>
                        <Typography variant="h1" sx={{ color: tokens.ON_NIGHT }}>
                            Scan check-in
                        </Typography>
                        <Typography variant="body2" sx={{ color: tokens.ON_NIGHT_MUTED, mt: 0.5 }}>
                            Point the camera at the code on their phone
                        </Typography>
                    </Box>

                    <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={checkinType}
                        onChange={(_event, next) => next && setCheckinType(next)}
                        aria-label="What this scan records"
                        sx={{
                            bgcolor: tokens.NIGHT_RAISED,
                            borderRadius: 2,
                            p: 0.5,
                            gap: 0.5,
                            "& .MuiToggleButton-root": {
                                border: 0,
                                borderRadius: "6px !important",
                                px: 2.5,
                                color: tokens.ON_NIGHT_MUTED,
                                fontWeight: 550,
                                "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                                "&.Mui-selected": {
                                    bgcolor: "primary.main",
                                    color: "#fff",
                                    "&:hover": { bgcolor: "primary.dark" },
                                },
                            },
                        }}
                    >
                        <ToggleButton value="event">Event</ToggleButton>
                        <ToggleButton value="food">Food</ToggleButton>
                    </ToggleButtonGroup>

                    {/* The camera, and the verdict laid straight over it. */}
                    <Box
                        sx={{
                            position: "relative",
                            width: "100%",
                            maxWidth: 460,
                            aspectRatio: "1 / 1",
                            borderRadius: 3,
                            overflow: "hidden",
                            bgcolor: "#000",
                            border: `1px solid ${tokens.NIGHT_LINE}`,
                        }}
                    >
                        <Box
                            component="video"
                            ref={videoRef}
                            playsInline
                            muted
                            autoPlay
                            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />

                        {/* corner marks, so there is something to aim with */}
                        {!result && <Reticle />}

                        {outcome && (
                            <Stack
                                role="status"
                                aria-live="assertive"
                                justifyContent="center"
                                alignItems="center"
                                spacing={1}
                                sx={{
                                    position: "absolute",
                                    inset: 0,
                                    px: 3,
                                    textAlign: "center",
                                    bgcolor: outcome.tone,
                                    color: "#fff",
                                }}
                            >
                                <Typography
                                    variant="overline"
                                    sx={{ color: "rgba(255,255,255,0.85)" }}
                                >
                                    {outcome.title}
                                </Typography>
                                <Typography
                                    variant="h2"
                                    sx={{ color: "#fff", wordBreak: "break-word" }}
                                >
                                    {result.name}
                                </Typography>
                                <Typography sx={{ color: "rgba(255,255,255,0.9)" }}>
                                    {result.detail}
                                </Typography>
                            </Stack>
                        )}
                    </Box>

                    <Typography
                        variant="body2"
                        align="center"
                        sx={{ color: tokens.ON_NIGHT_MUTED, maxWidth: 380 }}
                    >
                        Recording {checkinType === "event" ? "event check-in" : "food"}. If nothing
                        happens, ask them to turn their screen brightness up.
                    </Typography>
                </Container>
            </Box>
        </Layout>
    );
}

/** Four corner marks. Aiming furniture, not decoration. */
function Reticle() {
    const arm = { position: "absolute", width: 26, height: 26, borderColor: "rgba(255,255,255,0.7)" };
    return (
        <Box sx={{ position: "absolute", inset: 28, pointerEvents: "none" }}>
            <Box sx={{ ...arm, top: 0, left: 0, borderTop: 2, borderLeft: 2, borderTopLeftRadius: 6 }} />
            <Box sx={{ ...arm, top: 0, right: 0, borderTop: 2, borderRight: 2, borderTopRightRadius: 6 }} />
            <Box sx={{ ...arm, bottom: 0, left: 0, borderBottom: 2, borderLeft: 2, borderBottomLeftRadius: 6 }} />
            <Box sx={{ ...arm, bottom: 0, right: 0, borderBottom: 2, borderRight: 2, borderBottomRightRadius: 6 }} />
        </Box>
    );
}

export default AdminScan;
