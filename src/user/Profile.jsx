import Layout from "./Layout";
import Registration from "../Registration";
import JudgeRegistration from "../JudgeRegistration";
import { useContext, useState } from "react";
import { AuthContext } from "../App";
import { hasRole, roleList } from "../roles";
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Typography,
} from "@mui/material";
import { auth, database } from "../firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { ref, update } from "firebase/database";

// page title
import usePageTitle from "../usePageTitle";

const DIETARY = ["none", "vegetarian", "vegan", "gluten-free"];

// label/value pairs on one line each, rather than a stack of centred headings
function Row({ label, children }) {
    return (
        <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
                alignItems: { xs: "flex-start", sm: "center" },
                py: 1.25,
                gap: { xs: 0.25, sm: 2 }
            }}>
            <Typography variant="body2" sx={{ minWidth: 150 }}>
                {label}
            </Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
        </Stack>
    );
}

function Profile() {
    const { userData, userTypes, userCredential, refreshUserData, profileLoadError, loadingUserData } = useContext(AuthContext);
    const [recoveryRole, setRecoveryRole] = useState(null);
    const roles = roleList(userTypes);
    const navigate = useNavigate();
    const [sentReset, setSentReset] = useState(false);
    const [resetError, setResetError] = useState("");
    const [dietaryRestriction, setDietaryRestriction] = useState(
        userData?.dietaryRestriction ?? "none"
    );

    usePageTitle("Profile");

    const setDietaryRestrictions = async (restriction) => {
        if (!userData || !restriction) return;
        await update(ref(database, `/competitors/${userCredential.user.uid}`), {
            dietaryRestriction: restriction,
        });
        setDietaryRestriction(restriction);
    };

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

    if (!userData && !profileLoadError && !loadingUserData && recoveryRole && userCredential?.user) {
        const Form = recoveryRole === "competitor" ? Registration : JudgeRegistration;
        return <Form recoveryUser={userCredential.user} onComplete={async () => {
            await refreshUserData();
            setRecoveryRole(null);
        }} />;
    }

    if (!userData) {
        return (
            <Layout maxWidth="sm">
                <Typography variant="h1" gutterBottom>
                    Profile
                </Typography>
                <Alert severity="warning">
                    {profileLoadError
                        ? "Your profile could not be loaded. Check your connection and try again."
                        : "Your account is ready, but registration is incomplete. Complete your profile to continue."}
                </Alert>
                {profileLoadError ? (
                    <Button onClick={refreshUserData} disabled={loadingUserData}>Try again</Button>
                ) : (
                    <Stack spacing={2} sx={{ mt: 2 }}>
                        <Typography variant="h2">Complete your profile</Typography>
                        <Button variant="contained" onClick={() => setRecoveryRole("competitor")}>
                            Complete student registration
                        </Button>
                        <Button variant="outlined" onClick={() => setRecoveryRole("judge")}>
                            Complete judge or mentor registration
                        </Button>
                    </Stack>
                )}
                <Button variant="outlined" onClick={handleLogout} sx={{ mt: 2 }}>
                    Log out
                </Button>
            </Layout>
        );
    }

    return (
        <Layout maxWidth="sm">
            <Typography variant="h1" gutterBottom>
                Profile
            </Typography>

            <Card>
                <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                    <Row label="Name">
                        <Typography>
                            {userData.firstName} {userData.lastName}
                        </Typography>
                    </Row>
                    <Divider />
                    <Row label="Email">
                        <Typography sx={{ wordBreak: "break-all" }}>{userData.email}</Typography>
                    </Row>
                    <Divider />
                    <Row label="Role">
                        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
                            {roles.length ? (
                                roles.map((role) => (
                                    <Chip
                                        key={role}
                                        label={role}
                                        size="small"
                                        variant="outlined"
                                        sx={{ textTransform: "capitalize" }}
                                    />
                                ))
                            ) : (
                                <Typography variant="body2">None assigned</Typography>
                            )}
                        </Stack>
                    </Row>
                    {hasRole(userTypes, "competitor") && (
                        <>
                            <Divider />
                            <Row label="Dietary restrictions">
                                <FormControl sx={{ minWidth: 200 }}>
                                    <InputLabel id="dietary-label">Dietary restrictions</InputLabel>
                                    <Select
                                        labelId="dietary-label"
                                        label="Dietary restrictions"
                                        value={dietaryRestriction}
                                        onChange={(e) => setDietaryRestrictions(e.target.value)}
                                    >
                                        {DIETARY.map((option) => (
                                            <MenuItem
                                                key={option}
                                                value={option}
                                                sx={{ textTransform: "capitalize" }}
                                            >
                                                {option}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Row>
                        </>
                    )}
                </CardContent>
            </Card>

            {sentReset && (
                <Alert severity="success" sx={{ mt: 2 }}>
                    Password reset email sent. Check your inbox and spam folder.
                </Alert>
            )}
            {resetError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {resetError}
                </Alert>
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                {!sentReset && (
                    <Button variant="outlined" onClick={handlePasswordReset}>
                        Send password reset
                    </Button>
                )}
                <Button variant="outlined" onClick={handleLogout}>
                    Log out
                </Button>
            </Stack>
        </Layout>
    );
}

export default Profile;
