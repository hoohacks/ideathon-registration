import React, { isValidElement, useState } from 'react';

// firebase
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { database, storage } from './firebase';
import { ref, push, child, update } from "firebase/database";
import { uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ref as storageRef } from 'firebase/storage'; // avoid naming issues

// react pop up
import { Popup } from 'reactjs-popup';
import 'reactjs-popup/dist/index.css';

// import mui styling
import {
    Box,
    Card,
    Typography,
    InputLabel,
    TextField,
    Select,
    MenuItem,
    LinearProgress,
    Button,
    Checkbox,
    FormControlLabel,
    FormGroup,
    FormControl,
    Grid,
    Link,
    RadioGroup,
    Radio,
    FormHelperText
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// import logo
import Logo from "./images/logo.png";
import { maxWidth } from '@mui/system';

// email format
const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

const AdminRegistration = () => {

    const popupMessages = () => {
        if (firstNameCheck && lastNameCheck && isValidEmail && emailCheck && passwordCheck) {
            return <Button
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
                    }
                }}
                type="submit"
                onClick={() => handleSubmit()}
            >
                Create Account
            </Button>
        }
        else if (!passwordCheck) {
            return <Popup
                trigger={
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
                            }
                        }}
                        type="submit"
                    >
                        Create Account
                    </Button>
                }
                on="hover"
                position="top center"
            >
                <Box
                    sx={{
                        padding: "5px",
                        textAlign: "center",
                        display: "flex",
                        flexFlow: "column nowrap",
                    }}
                >
                    <Typography>The passwords do not match.</Typography>
                </Box>
            </Popup>
        }
        else {
            return <Popup
                trigger={
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
                            }
                        }}
                        type="submit"
                    >
                        Create Account
                    </Button>
                }
                on="hover"
                position="top center"
            >
                <Box
                    sx={{
                        padding: "5px",
                        textAlign: "center",
                        display: "flex",
                        flexFlow: "column nowrap",
                    }}
                >
                    <Typography>Please fill out the remaining fields.</Typography>
                </Box>
            </Popup>
        }
    }
    // theme
    const theme = createTheme({
        palette: {
            secondary: {
                main: '#f82249'
            },
            primary: {
                main: '#ff9daf'
            },
            warning: {
                main: '#f82249'
            },
            error: {
                main: '#f82249'
            },
            info: {
                main: '#f82249'
            }
        }
    });

    // text-fields
    const [firstName, setFirstName] = useState('');
    const [firstNameCheck, setFirstNameCheck] = useState(false);
    const [lastName, setLastName] = useState('');
    const [lastNameCheck, setLastNameCheck] = useState(false);
    const [password, setPassword] = useState('');
    const [passwordCheck, setPasswordCheck] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [email, setEmail] = useState('');
    const [emailCheck, setEmailCheck] = useState(false);

    // email check
    const [isValidEmail, setIsValidEmail] = useState(true);

    // successful registration upload
    const [successRegistration, setSuccessRegistration] = useState(false);

    async function handleSubmit() {

        let applicant = {
            firstName: firstName,
            lastName: lastName,
            email: email,
            password: password,
            registeredAt: firebase.firestore.Timestamp.now().toDate().toString(),
        };

        const newPostKey = push(child(ref(database), 'posts')).key;
        const updates = {};
        updates['/' + newPostKey] = applicant;
        return update(ref(database), updates).then(() => setSuccessRegistration(true)).catch((error) => {
            console.warn(error)
        });
    }




    function Copyright() {
        return (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ marginTop: "10px" }}>
                {'Copyright © '}
                <Link color="inherit" href="https://ideathon.hoohacks.io">
                    Hoohacks Ideathon
                </Link>{' '}
                {new Date().getFullYear()}
            </Typography>
        );
    }

    return (
        <>
            <ThemeProvider theme={theme}>
                <Grid
                    container
                    spacing={0}
                    direction="column"
                    alignItems="center"
                    justifyContent="center"
                    style={{ minHeight: '100vh', minWidth: '100wh' }}
                >
                    <Box
                        sx={{
                            width: "100%",
                            justifyContent: "center",
                            alignItems: "center",
                            marginLeft: "auto",
                            marginRight: "auto",
                            display: "flex",
                        }}
                    >
                        <Card
                            sx={{
                                boxShadow: 4,
                                display: "flex",
                                flexFlow: "column nowrap",
                                margin: "24px",
                                width: "582px",
                                alignItems: "center",
                                backgroundColor: "#fff",
                                padding: "22px 22px",
                                gap: "16px",
                                border: "none",
                                boxShadow: "none",
                                [theme.breakpoints.down('md')]: {
                                    margin: "0",
                                }
                            }}
                        >

                            {/* IDEATHON LOGO */}
                            <Link
                                href="https://ideathon.hoohacks.io"
                                sx={{

                                    maxWidth: "582px",
                                    [theme.breakpoints.down('md')]: {
                                        maxWidth: "402px",

                                    }
                                }}
                            >
                                <img
                                    src={Logo}
                                    style={{
                                        borderRadius: "5px",
                                        width: "582px",
                                        objectFit: "cover",
                                        [theme.breakpoints.down('md')]: {
                                            width: "402px",
                                        }
                                    }}

                                />
                            </Link>



                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexFlow: "row nowrap",
                                    justifyContent: "center",
                                    gap: "8px"
                                }}
                            >
                                <TextField
                                    fullWidth={true}
                                    required
                                    id="first-name"
                                    name="first-name"
                                    label="First Name"
                                    variant="outlined"
                                    value={firstName}
                                    type="text"
                                    size="large"
                                    autoComplete="first-name"
                                    onChange={(e) => { setFirstName(e.target.value.replace(/[^a-z]/gi, '')); setFirstNameCheck(firstName !== '') }}
                                    helperText={firstName === '' && <Typography sx={{ color: "#f82249", fontSize: "11px" }}>Enter your first name</Typography>}
                                />
                                <TextField
                                    fullWidth={true}
                                    required
                                    id="last-name"
                                    name="last-name"
                                    variant="outlined"
                                    label="Last Name"
                                    size="large"
                                    value={lastName}
                                    type="text"
                                    autoComplete="last-name"
                                    onChange={(e) => { setLastName(e.target.value.replace(/[^a-z]/gi, '')); setLastNameCheck(lastName !== '') }}
                                    helperText={lastName === '' && <Typography sx={{ color: "#f82249", fontSize: "11px" }}>Enter your last name</Typography>}
                                />
                            </Box>
                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexFlow: "row nowrap",
                                    justifyContent: "center",
                                    gap: "8px"
                                }}
                            >
                                <TextField
                                    fullWidth={true}
                                    required
                                    id="password"
                                    name="password"
                                    label="Password"
                                    variant="outlined"
                                    value={password}
                                    type="password"
                                    size="large"
                                    autoComplete="password"
                                    onChange={(e) => { setPasswordCheck(password === confirmPassword); }}
                                    helperText={password === '' && <Typography sx={{ color: "#f82249", fontSize: "11px" }}>Create a password</Typography>}
                                />
                                <TextField
                                    fullWidth={true}
                                    required
                                    id="confirm-password"
                                    name="confirm-password"
                                    variant="outlined"
                                    label="Confirm Password"
                                    size="large"
                                    value={confirmPassword}
                                    type="password"
                                    autoComplete="confirm-password"
                                    onChange={(e) => { setPasswordCheck(password === confirmPassword); }}
                                    helperText={confirmPassword === '' && <Typography sx={{ color: "#f82249", fontSize: "11px" }}>Confirm your password</Typography>}
                                />
                            </Box>
                            <TextField
                                fullWidth={true}
                                required
                                id="Email"
                                label="Email Address"
                                name="Email"
                                variant="outlined"
                                size="large"
                                value={email}
                                type="email"
                                autoComplete="email"
                                onBlur={() => setIsValidEmail(mailformat.test(email))}
                                error={!isValidEmail}
                                onChange={(e) => { setEmail(e.target.value); setEmailCheck(email !== '') }}
                                helperText={(email === '' && <Typography sx={{ color: "#f82249", fontSize: "11px" }}>Enter your email</Typography>) ||
                                    (!isValidEmail && <Typography sx={{ color: "#f82249", fontSize: "11px" }}>Invalid Email Format</Typography>)
                                }
                            />
                            <Box
                                sx={{
                                    display: "flex",
                                    flexFlow: "row nowrap",
                                    gap: "16px",
                                }}
                            >

                                {popupMessages()}

                                <Link href="https://ideathon.hoohacks.io">
                                    <Button
                                        sx={{
                                            backgroundColor: "#fff",
                                            color: "#f82249",
                                            border: "1px solid",
                                            borderColor: "#f82249",
                                            boxShadow: 2,
                                            "&:hover": {
                                                transform: "scale3d(1.05, 1.05, 1)",
                                                backgroundColor: "#f82249",
                                                color: "#fff",
                                            }
                                        }}
                                        type="button"
                                    >
                                        Cancel
                                    </Button>
                                </Link>
                            </Box>
                        </Card>
                    </Box>
                    <Copyright />
                </Grid>
            </ThemeProvider>
        </>
    )
};

export default AdminRegistration;
