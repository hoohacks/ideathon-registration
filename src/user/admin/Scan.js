import Layout from "../Layout";

// ------ Description ------
//Add an endpoint /user/admin/scan (only accessible by admins) to scan a QR code and check a user in. The QR code is already generated for you, and it should represent a UID:

//For example, the following QR code represents the UID gFmH3pg0OqcP2bc6baPmmB21FiG3, which is the user with the email lindiana1206@gmail.com. Feel free to use this QR code for testing if the QR code generation task is not already done.

//Make sure that only admins can check in other users (via Firebase rules)

// ------ logic ------
// use react-qr-reader that has built-in camera feature to scan uid
// import firebase db
// Firebase checked in boolean set to true

function AdminScan() {
    return (
        <Layout>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "20px",
                }}
            >
                <h1>Admin Scan with QR</h1>
                {/* Set link to open scanner */}
                <a
                    href=""
                    target="_blank"
                    style={{
                        background: "linear-gradient(220deg, #1976D2, #1d4ed8)",
                        color: "#ffffff",
                        fontWeight: 600,
                        padding: "15px 25px",
                        borderRadius: "12px",
                        textDecoration: "none",
                        boxShadow: "0 4px 10px rgba(37, 99, 235, 0.3)",
                        cursor: "pointer",
                        textAlign: "center",
                    }}
                >
                    Click to Check-In Participants
                </a>
            </div>
        </Layout>
    );
}

export default AdminScan;
