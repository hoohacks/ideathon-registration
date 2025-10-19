import Layout from "../Layout";
import React, { useState } from "react";
// qr
import { useZxing } from "react-zxing";
// firebase
import { database } from "../../firebase";
import { ref, get, update, set } from "firebase/database";

function AdminScan() {
    // pause scanner and popup
    const [paused, setPaused] = useState(false);
    const [popup, setPopup] = useState({ open: false, title: "", message: "" });

    // state for type of check in. This can be "event" or "food" that the user can pick to scan.
    // uses radio button for ui
    const [checkinType, setCheckinType] = useState("event");

    // zxing library for qr code
    const { ref: videoRef } = useZxing({
        // this runs whenever a code is detected
        async onDecodeResult(decodeResult) {
            const userId = decodeResult.getText();
            if (!userId) return;

            // pause the decoding so it doesnt break
            setPaused(true);

            try {
                // could be either judge or competitor so get reference
                const competitorRef = ref(database, `competitors/${userId}`);
                const judgeRef = ref(database, `judges/${userId}`);

                // get their data
                const competitorData = await get(competitorRef);
                const judgeData = await get(judgeRef);

                // check if they exist
                if (competitorData.exists()) {
                    //gets their data in json
                    const data = competitorData.val();

                    if (checkinType === "event") {
                        // if they are checked in open the pop up showing they're already checked in
                        if (data.checkedIn === true) {
                            setPopup({
                                open: true,
                                title: "Already Checked-in",
                                message: `Competitor ${data.firstName} ${data.lastName} is already checked-in`,
                            });
                        } else {
                            // checks them in firebase
                            await update(competitorRef, { checkedIn: true });

                            setPopup({
                                open: true,
                                title: "Success",
                                message: `Checked-in competitor ${data.firstName} ${data.lastName}`,
                            });
                        }
                    } else if (checkinType === "food") {
                        if (data.foodCheckIn === true) {
                            setPopup({
                                open: true,
                                title: "Already Received Food",
                                message: `Competitor ${data.firstName} ${data.lastName} already received food`,
                            });
                        } else {
                            // checks them in firebase
                            await update(competitorRef, { foodCheckIn: true });

                            setPopup({
                                open: true,
                                title: "Success",
                                message: `Checked-in competitor ${data.firstName} ${data.lastName} for food`,
                            });
                        }
                    }
                } else if (judgeData.exists()) {
                    //gets their data in json
                    const data = judgeData.val();

                    if (checkinType === "event") {
                        // if they are checked in open the pop up showing they're already checked in
                        if (data.checkedIn === true) {
                            setPopup({
                                open: true,
                                title: "Already Checked-in",
                                message: `Judge ${data.firstName} ${data.lastName} is already checked-in`,
                            });
                        } else {
                            // checks them in firebase
                            await update(judgeRef, { checkedIn: true });

                            setPopup({
                                open: true,
                                title: "Success",
                                message: `Checked-in judge ${data.firstName} ${data.lastName}`,
                            });
                        }
                    } else if (checkinType === "food") {
                        if (data.foodCheckIn === true) {
                            setPopup({
                                open: true,
                                title: "Already Received Food",
                                message: `Judge ${data.firstName} ${data.lastName} already received food`,
                            });
                        } else {
                            // checks them in firebase
                            await update(judgeRef, { foodCheckIn: true });

                            setPopup({
                                open: true,
                                title: "Success",
                                message: `Checked-in judge ${data.firstName} ${data.lastName} for food`,
                            });
                        }
                    }
                } else {
                    setPopup({
                        open: true,
                        title: "User Not Found",
                        message: `No competitor or judge found with ID: ${userId}`,
                    });
                }
            } catch (err) {
                setPopup({
                    open: true,
                    title: "Error",
                    message: `Failed to check-in ${userId}`,
                });
                //pauses for 2.5s so it doesn't rapid scan and break it
                // includes popup timeout here too
            } finally {
                setTimeout(() => setPaused(false), 2500);
                setTimeout(
                    () => setPopup({ open: false, title: "", message: "" }),
                    2500
                );
            }
        },
        constraints: {
            // this makes mobile phones use the rear camera to scan
            video: { facingMode: "environment" },
            audio: false,
        },
        // zxing has a built in parameter (paused) which pauses the decoding/video
        paused,
    });

    return (
        <Layout>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "80vh",
                    padding: "16px",
                    gap: "20px",
                }}
            >
                <h1 style={{ lineHeight: "10px" }}>Check-in QR</h1>
                <div
                    style={{
                        display: "flex",
                        gap: "10px",
                        backgroundColor: "#edededff",
                        borderRadius: "10px",
                        padding: "5px",
                    }}
                >
                    <button
                        onClick={() => setCheckinType("event")}
                        style={{
                            border: "0px",
                            borderRadius: "10px",
                            padding: "10px 20px",
                            fontWeight: "600",
                            transition: "all 0.2s ease",
                            backgroundColor:
                                checkinType === "event" ? "#1976D2" : "white",
                            color: checkinType === "event" ? "white" : "black",
                        }}
                    >
                        Event Check-in
                    </button>
                    <button
                        onClick={() => setCheckinType("food")}
                        style={{
                            border: "0px",
                            borderRadius: "10px",
                            padding: "10px 20px",
                            fontWeight: "600",
                            transition: "all 0.2s ease",
                            backgroundColor:
                                checkinType === "food" ? "#d21919ff" : "white",
                            color: checkinType === "food" ? "white" : "black",
                        }}
                    >
                        Food Check-in
                    </button>
                </div>
                <video
                    ref={videoRef}
                    style={{
                        width: "min(92vw, 640px)",
                        aspectRatio: "1 / 1",
                        height: "auto",
                        objectFit: "cover",
                        borderRadius: "20px",
                    }}
                    playsInline
                    muted
                    autoPlay
                />
                <p style={{ textAlign: "center" }}>
                    If it is not scanning, ensure brightness is at 100%
                </p>
            </div>
            {popup.open && (
                <div>
                    {/* background overlay so user cant click anything else */}
                    <div
                        style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(0, 0, 0, 0.5)",
                            zIndex: 999,
                        }}
                    />
                    {/* popup */}
                    <div
                        style={{
                            position: "fixed",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1000,
                        }}
                    >
                        <div
                            style={{
                                backgroundColor: "white",
                                borderRadius: "20px",
                                padding: "20px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                                width: "50vw",
                                minWidth: "300px",
                            }}
                        >
                            <h1
                                style={{
                                    margin: 0,
                                    color:
                                        popup.title === "Error"
                                            ? "#d32f2f"
                                            : "#1976d2",
                                }}
                            >
                                {popup.title}
                            </h1>
                            <p style={{ margin: 0 }}>{popup.message}</p>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}

export default AdminScan;
