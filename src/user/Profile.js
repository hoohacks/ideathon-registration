import Layout from "./Layout";
import { useContext, useRef, useState } from "react";
import { AuthContext } from "../App";
import { Button, Typography } from "@mui/material";
import { auth } from "../firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import { ref, update } from "firebase/database";
import { database } from "../firebase";

function Profile() {
    const { userData, userTypes, userCredential } = useContext(AuthContext);
    const navigate = useNavigate();
    const [sentReset, setSentReset] = useState(false);
    const [resetError, setResetError] = useState("");
    const [dietaryRestriction, setDietaryRestriction] = useState(userData?.dietaryRestriction ?? "none");

    const setDietaryRestrictions = async (restriction) => {
        if (!userData) return "N/A";

        if (!restriction || restriction.length === 0)
            return "none";

        await update(ref(database, `/competitors/${userCredential.user.uid}`), {
            dietaryRestriction: restriction
        });
        setDietaryRestriction(restriction);
    }


    const handlePasswordReset = async () => {
        const email = userData?.email ?? userCredential?.user?.email;
        if (!email) {
            setResetError("No email on file for this account.");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            setSentReset(true);
            setResetError("");
        } catch (error) {
            console.error("Error sending password reset email:", error);
            setResetError("Could not send the reset email. Please try again.");
        }
    };

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate("/login", { replace: true });
        } catch (error) {
            console.error("Error during logout:", error);
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
                        {/* {
                            userTypes.includes("competitor") && (
                                <Typography variant="h6" style={{ fontStyle: 'italic' }}>
                                    {
                                        userData.teamId ? userData.teamId : "Not in a team"
                                    }

                                </Typography>
                            )
                        } */}
                        <br />
                        {
                            userTypes.includes("competitor") && (
                                <>
                                    <FormControl size="large" style={{ marginTop: '20px', minWidth: 300, textAlign: 'left' }}>
                                        <InputLabel>Dietary Restrictions</InputLabel>
                                        <Select
                                            labelId="dietary-restriction-select"
                                            label="Dietary Restrictions"
                                            value={dietaryRestriction}
                                            size="large"
                                            onChange={(e) => {
                                                setDietaryRestrictions(e.target.value);
                                            }}
                                        >
                                            <MenuItem value="vegetarian">Vegetarian</MenuItem>
                                            <MenuItem value="gluten-free">Gluten Free</MenuItem>
                                            <MenuItem value="vegan">Vegan</MenuItem>
                                            <MenuItem value="none">None</MenuItem>
                                        </Select>
                                    </FormControl>
                                </>
                            )
                        }
                        <hr />
                        {
                            sentReset ? (
                                <Typography variant="body1" style={{ textAlign: 'center' }}>
                                    Password reset email sent! Please check your inbox and spam folder.
                                </Typography>
                            ) : (
                                <>
                                    <Button variant="contained" color="primary" onClick={handlePasswordReset}>
                                        Send Password Reset Email
                                    </Button>
                                    {resetError ? (
                                        <Typography variant="body2" color="error" style={{ marginTop: "10px" }}>
                                            {resetError}
                                        </Typography>
                                    ) : null}
                                </>
                            )
                        }
                        <hr />
                        <Button variant="outlined" color="secondary" onClick={handleLogout}>
                            Logout
                        </Button>
                    </div>
                ) : (
                    <p>No user data found. Please contact HooHacks at <a href="mailto:support@hoohacks.com">support@hoohacks.com</a></p>
                )
            }
        </Layout>
    );
}

export default Profile;
