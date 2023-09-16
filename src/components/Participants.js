import React, { useEffect } from 'react'

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

// import firebase
import { database } from './firebase';
import { get, child, ref } from 'firebase/database';

const Participants = () => {

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

    useEffect(() => { return () => { const dbRef = ref(db) get(child(dbRef, "userdataRecord")).then((snapshot) => { var DataUser = []; snapshot.forEach(childSnapshot => { DataUser.push(childSnapshot.val()) }) TableDataGet(DataUser) }) } }, [])

    // fetch participants from firebase database
    useEffect(() => {
        get(child(ref(database), "/")).then((snapshot) => {
            snapshot.forEach(
                childSnapshot => console.log(childSnapshot.val())
            )
        });
    }, []);

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
                            <Typography>Participants</Typography>
                        </Card>
                    </Box>
                </Grid>
            </ThemeProvider>
        </>
    )
}

export default Participants;
