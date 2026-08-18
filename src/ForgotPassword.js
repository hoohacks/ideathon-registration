
import React, { useState } from "react";
import {
    Button,
    TextField,
    Link,
    Box,
    Typography,
    Container,
    CssBaseline,
} from "@mui/material";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";
import Popup from "reactjs-popup";
import "reactjs-popup/dist/index.css";

export default function ForgotPasswordPage() {
    const [sentReset, setSentReset] = useState(false);
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);

    const theme = createTheme({
        palette: {
            secondary: {
                main: "#f82249",
            },
            primary: {
                main: "#ff9daf",
            },
            warning: {
                main: "#f82249",
            },
            error: {
                main: "#f82249",
            },
            info: {
                main: "#f82249",
            },
        },
    });

    const [formData, setFormData] = useState({
        email: "",
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (sending) return;
        setSending(true);
        setError("");
        try {
            await sendPasswordResetEmail(auth, formData.email);
            setSentReset(true);
        } catch (err) {
            // this used to only reach the console, so a failed reset looked
            // exactly like a successful one from the outside
            console.error("Error sending password reset email:", err);
            setError(
                err.code === "auth/invalid-email"
                    ? "That does not look like a valid email address."
                    : "Could not send the reset email. Please check the address and try again."
            );
        } finally {
            setSending(false);
        }
    };

    return (
        <ThemeProvider theme={theme}>
            <Popup open={sentReset} modal>
                <Box
                    sx={{
                        borderRadius: "5px",
                        textAlign: "center",
                        padding: "15px",
                        display: "flex",
                        flexFlow: "column",
                        gap: "8px",
                    }}
                >
                    <Typography>Sent password reset email!</Typography>
                    <Link href="#/login">
                        <Button
                            sx={{
                                backgroundColor: "#f82249",
                                color: "#fff",
                                boxShadow: 2,
                                "&:hover": {
                                    transform: "scale3d(1.05, 1.05, 1)",
                                    backgroundColor: "#fff",
                                    color: "#f82249",
                                    border: "1px solid",
                                    borderColor: "#f82249",
                                },
                            }}
                            type="button"
                        >
                            Go to Login Page
                        </Button>
                    </Link>
                </Box>
            </Popup>
            <Container component="main" maxWidth="xs">
                <CssBaseline />
                <Box
                    sx={{
                        marginTop: 8,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                    }}
                >
                    <Typography component="h1" variant="h5">
                        Reset Password
                    </Typography>
                    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="email"
                            label="Email Address"
                            name="email"
                            autoComplete="email"
                            autoFocus
                            value={formData.email}
                            onChange={handleChange}
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            sx={{ mt: 3, mb: 2 }}
                            disabled={sending}
                        >
                            {sending ? "Sending..." : "Send Reset Link"}
                        </Button>
                        {error ? (
                            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
                                {error}
                            </Typography>
                        ) : null}
                    </Box>
                </Box>
            </Container>
        </ThemeProvider>
    );
}

