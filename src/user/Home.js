import Layout from "./Layout";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../App";
import { Typography } from "@mui/material";
import { ref, onValue } from "firebase/database";
import { database } from "../firebase";

// Fallback only. Set config/eventStart in the database to an ISO timestamp so
// the countdown can be moved without shipping a build.
const DEFAULT_EVENT_START = "2026-10-18T10:00:00";

function differenceToTime(target) {
    if (!target || Number.isNaN(target.getTime())) return null;

    const difference = target - new Date();
    if (difference <= 0) return null;

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((difference / (1000 * 60)) % 60);
    const seconds = Math.floor((difference / 1000) % 60);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function Home() {
    const { userData } = useContext(AuthContext);
    const [eventStart, setEventStart] = useState(() => new Date(DEFAULT_EVENT_START));
    const [time, setTime] = useState(() => differenceToTime(new Date(DEFAULT_EVENT_START)));

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
        const interval = setInterval(() => {
            setTime(differenceToTime(eventStart));
        }, 1000);
        // without this the timer kept running after the page unmounted
        return () => clearInterval(interval);
    }, [eventStart]);

    return (
        <Layout>
            <Typography variant="h4" gutterBottom style={{ fontWeight: 'bold', textAlign: 'center' }}>
                Welcome to Ideathon{userData && userData.firstName ? `, ${userData.firstName}` : ""}!
            </Typography>
            <hr />
            {time ? (
                <>
                    <Typography variant="h2" style={{ fontStyle: 'italic', textAlign: 'center' }}>
                        {time}
                    </Typography>
                    <Typography variant="h4" style={{ textAlign: 'center' }}>
                        Until Ideathon
                    </Typography>
                </>
            ) : (
                <Typography variant="h4" style={{ textAlign: 'center' }}>
                    Ideathon is Live!
                </Typography>
            )}
        </Layout>
    );
}

export default Home;
