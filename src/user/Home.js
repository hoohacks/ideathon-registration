import Layout from "./Layout";
import { useContext } from "react";
import { AuthContext } from "../App";
import { Typography } from "@mui/material";
import { useEffect, useState } from "react";

function Home() {
    const { userData } = useContext(AuthContext);

    const target = new Date("2025-10-19T10:00:00"); // Set your target date and time here
    const differenceToTime = (target) => {
        const now = new Date();
        const difference = Math.floor(target - now);

        if (difference <= 0) {
            return null;
        }
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / (1000 * 60)) % 60);
        const seconds = Math.floor((difference / 1000) % 60);

        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    const [time, setTime] = useState(differenceToTime(target));

    useEffect(() => {
        setInterval(() => {
            setTime(differenceToTime(target));
        }, 1000);
    }, []);


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
