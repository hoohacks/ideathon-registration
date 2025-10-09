import Layout from "../Layout";
import React, { useState } from "react";
// qr
import { useZxing } from "react-zxing";
// firebase
import { database } from "../../firebase";
import { ref, get, update } from "firebase/database";

// ------ Description ------
//Add an endpoint /user/admin/scan (only accessible by admins) to scan a QR code and check a user in. The QR code is already generated for you, and it should represent a UID:

//For example, the following QR code represents the UID gFmH3pg0OqcP2bc6baPmmB21FiG3, which is the user with the email lindiana1206@gmail.com. Feel free to use this QR code for testing if the QR code generation task is not already done.

//Make sure that only admins can check in other users (via Firebase rules)

// ------ logic ------
// use react-qr-reader that has built-in camera feature to scan uid
// https://www.npmjs.com/package/react-zxing
// import firebase db
// Firebase checked in boolean set to true

function AdminScan() {
    // pause scanner and popup
    const [paused, setPaused] = useState(false);
    const [popup, setPopup] = useState({ open: false, title: "", message: "" });

    // zxing library for qr code
    const [result, setResult] = useState("");
    const { ref: videoRef } = useZxing({
        async onDecodeResult(decodeResult) {
            const userId = decodeResult.getText();
            if (!userId) return;

            setPaused(true);

            try {
                // could be either judge or competitor so get reference
                const competitorRef = ref(database, `competitors/${userId}`);
                const judgeRef = ref(database, `judges/${userId}`);

                // get them
                const competitorData = await get(competitorRef);
                const judgeData = await get(judgeRef);

                // check if they exist
                if (competitorData.exists()) {
                    await update(competitorRef, { checkedIn: true });
                    const data = competitorData.val();
                    setPopup({ open: true, title: "Success", message: `Checked-in competitor ${data.firstName} ${data.lastName}` })
                } else if (judgeData.exists()) {
                    await update(judgeRef, { checkedIn: true });
                    const data = judgeData.val();
                    setPopup({ open: true, title: "Success", message: `Checked-in judge ${data.firstName} ${data.lastName}` })
                } else {
                    setPopup({ open: true, title: "Error", message: `Failed to check-in ${userId}` })
                }
            } catch (err) {
                setPopup({ open: true, title: "Error", message: `Failed to check-in ${userId}` })
            //pauses for 1.5s so it doesn't rapid scan and break it
            // maybe include popup timeout here too 
            } finally {
                setTimeout(() => setPaused(false), 1500);
            }
        },
        constraints: {
            video: { facingMode: "environment" },
            audio: false,
        },
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
                    gap: "16px",
                }}
            >
                <h1>Check-in QR</h1>
                <video
                    ref={videoRef}
                    style={{
                        width: "min(92vw, 640px)",
                        aspectRatio: "1 / 1",
                        height: "auto",
                        objectFit: "cover",
                        borderRadius: "20px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                    }}
                    playsInline
                    muted
                    autoPlay
                />
            </div>
        </Layout>
    );
}

export default AdminScan;
