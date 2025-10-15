import Layout from "./Layout";
import { useContext, useState } from "react";
import { AuthContext } from "../App";
import { Button, Typography } from "@mui/material";
import { auth } from "../firebase";
import { sendPasswordResetEmail } from "firebase/auth";

function Profile() {
    const { userData } = useContext(AuthContext);
    const [sentReset, setSentReset] = useState(false);


    const handlePasswordReset = async () => {
        // Implement password reset functionality here
        try {
            await sendPasswordResetEmail(auth, userData.email);
            setSentReset(true);
        } catch (error) {
            console.error("Error sending password reset email:", error);
        }
    };

    return (
        <Layout>
            <Typography variant="h4" gutterBottom style={{ fontWeight: 'bold', textAlign: 'center' }}>
                Profile Information
            </Typography>
            {
                userData ? (
                    <div style={{ textAlign: 'center' }}>
                        <Typography variant="h5" style={{ fontWeight: 'bold' }}>
                            {userData.firstName} {userData.lastName}
                        </Typography>
                        <Typography variant="h6" style={{ fontStyle: 'bold' }}>
                            {userData.email}
                        </Typography>
                        <hr />
                        {
                            sentReset ? (
                                <Typography variant="body1" style={{ textAlign: 'center' }}>
                                    Password reset email sent! Please check your inbox and spam folder.
                                </Typography>
                            ) : (
                                <Button variant="contained" color="primary" onClick={handlePasswordReset}>
                                    Send Password Reset Email
                                </Button>
                            )
                        }
                    </div>
                ) : (
                    <p>No user data found. Please contact HooHacks at <a href="mailto:support@hoohacks.com">support@hoohacks.com</a></p>
                )
            }
        </Layout>
    );
}

export default Profile;
