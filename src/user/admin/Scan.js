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
    const [result, setResult] = useState("");
    const { ref } = useZxing({
        onDecodeResult(result) {
            setResult(result.getText());
        },
    });

    return (
        <Layout>
                {/* Put the qr code element here */}
                <video ref={ref} />
                <p>
                    <span>Last result:</span>
                    <span>{result}</span>
                </p>
        </Layout>
    );
}

export default AdminScan;
