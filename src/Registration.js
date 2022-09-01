import React, { useState } from 'react';

// firebase 
import { database, storage } from './firebase';
import { ref, push, child, update } from "firebase/database";
import { uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ref as storageRef } from 'firebase/storage'; // avoid naming issues

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
    Grid
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import CustomCheckbox from './components/CustomCheckbox';

// import logo
import Logo from "./images/logo.png";
import IdeathonHeader from "./images/ideathonheader.png";

const Registration = () => {

    // theme
    const theme = createTheme({
        palette: {
          secondary: {
            main: '#f82249'
          },
          primary: {
            main: '#ff9daf'
          }

        }
      });

    // text-fields
    const [firstName, setFirstName] = useState();
    const [lastName, setLastName] = useState();
    const [email, setEmail] = useState();
    const [skills, setSkills] = useState();
    const [major, setMajor] = useState();
    const [learn, setLearn] = useState();

    // dietary restrictions
    const [dietaryRestriction, setDietaryRestriction] = useState(['none']);
    const [otherDietaryRestriction, setOtherDietaryRestriction] = useState();

    // year
    const [selectYear, setSelectYear] = useState(2023);
    const [otherSelectYear, setOtherSelectYear] = useState(0);

    // school
    const [selectSchool, setSelectedSchool] = useState('college');

    // resume upload
    const [resumeName, setResumeName] = useState();
    const [uploadResume, setUploadResume] = useState();
    const [isResumePicked, setIsResumePicked] = useState(false);
    const [progress, setProgress] = useState(0);

    const changeResumeHandle = (event) => {
        const storageReference = storageRef(storage, `/ideathon-resume/${selectYear}/${event.target.files[0].name}`);
        const uploadResumeToDB = uploadBytesResumable(storageReference, event.target.files[0]);

        uploadResumeToDB.on("state_changed", (snapshot) => {
            setProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            setUploadResume(uploadResumeToDB);
        });

        setResumeName(event.target.files[0].name);
        setIsResumePicked(true);
    };


    // add multiple dietary restrictions
    const selectRestrictions = (event) => {

        var restList = [];

        if (restList.includes(event.target.value)) {
            var restList2 = restList.filter(function (value, index, arr) {
                return value !== event.target.value;
            });
            restList = restList2;
        }
        else {
            restList.push(event.target.value)
        }
        setDietaryRestriction(restList);
    };

    async function handleSubmit() {


        // checks if resume has been uploaded yet or not
        if (progress === 100 && isResumePicked) {
            // download url
            const url = await getDownloadURL(uploadResume.snapshot.ref);

            // update dietary restrictions with other value
            dietaryRestriction.push(otherDietaryRestriction);

            // update school year if other
            // if (otherSelectYear !== 0) {
            //     setSelectYear(otherSelectYear);
            // }

            let applicant = {
                firstName: firstName,
                lastName: lastName,
                email: email,
                schoolYear: selectYear,
                uvaSchool: selectSchool,
                resume: url,
                skills: skills,
                learn: learn,
                major: major,
                dietaryRestriction: dietaryRestriction,
            };

            const newPostKey = push(child(ref(database), 'posts')).key;
            const updates = {};
            updates['/' + newPostKey] = applicant;
            return update(ref(database), updates);
        }
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
                    style={{ minHeight: '100vh' }}
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
                                width: "992px",
                                alignItems: "center",
                                backgroundColor: "#fff",
                                padding: "14px 18px",
                                gap: "16px",
                            }}
                        >

                            {/* IDEATHON LOGO */}
                            <a href="https://ideathon.hoohacks.io ">
                                <img
                                    src={Logo}
                                    style={{
                                        borderRadius: "5px",
                                        width: "427px",
                                    }}
                                    
                                />
                            </a>


                            <Typography sx={{ textAlign: "center", }}>
                                The third annual Ideathon is a networking, team-building, and pitching event designed to help students with technical experience and students with business experience build their technical business ideas.  Student teams can meet 1:1 with industry experts about their ideas and form long lasting relationships with them as they continue to grow their ideas. Corporate sponsors will be holding workshops to teach students about pitching their ideas, valuing their potential businesses, and building technical prototypes. There will be a two hour pitch event, where teams will pitch to a board of sponsors for funding. Teams will have the opportunity to win thousands of dollars in funding in order to bring their idea to fruition!
                            </Typography>

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
                                    fullWidth="true"
                                    required
                                    id="first-name"
                                    name="first-name"
                                    label="First Name"
                                    variant="outlined"
                                    value={firstName}
                                    type="text"
                                    size="small"
                                    autoComplete="first-name"
                                    onChange={(e) => setFirstName(e.target.value)}
                                />
                                <TextField
                                    fullWidth="true"
                                    required
                                    id="last-name"
                                    name="last-name"
                                    variant="outlined"
                                    label="Last Name"
                                    size="small"
                                    value={lastName}
                                    type="text"
                                    autoComplete="last-name"
                                    onChange={(e) => setLastName(e.target.value)}
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
                                    fullWidth="true"
                                    required
                                    id="Email"
                                    label="Email Address"
                                    name="Email"
                                    variant="outlined"
                                    size="small"
                                    value={email}
                                    type="email"
                                    autoComplete="email"
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <TextField
                                    fullWidth="true"
                                    required
                                    id="major"
                                    label="What is your major/intended major?"
                                    name="major"
                                    variant="outlined"
                                    value={major}
                                    size="small"
                                    type="text"
                                    autoComplete="major"
                                    onChange={(e) => setMajor(e.target.value)}
                                />
                            </Box>
                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexFlow: "column nowrap",
                                    gap: "8px"
                                }}
                            >
                                <FormControl size="small">
                                    <InputLabel>Expected Graduation Date</InputLabel>
                                    <Select
                                        labelId="school-year-select"
                                        label="Expected Graduation Date"
                                        value={selectYear}
                                        onChange={(e) => setSelectYear(e.target.value)}
                                    >
                                        <MenuItem value={2023}>2023</MenuItem>
                                        <MenuItem value={2024}>2024</MenuItem>
                                        <MenuItem value={2025}>2025</MenuItem>
                                        <MenuItem value={2026}>2026</MenuItem>
                                        {/* <MenuItem value={0} onClick={(e) => console.log(e.target.value)}>Other</MenuItem> */}

                                    </Select>
                                    {/* {selectYear === 0 ? (
                                            <>
                                                <TextField
                                                    id="other-year"
                                                    label="Different Graduation Date"
                                                    name="other-year"
                                                    variant="outlined"
                                                    size="small"
                                                    type="text"
                                                    autoComplete="selectYear"
                                                    sx={{marginTop: "8px"}}
                                                    onChange={(e) => setOtherSelectYear(e.target.value)}
                                                />
                                            </>
                                        ) : null} */}
                                </FormControl>
                            </Box>
                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexFlow: "column nowrap",
                                    gap: "4px"
                                }}
                            >
                                <FormControl size="small">
                                    <InputLabel id="school-select">University of Virginia School</InputLabel>
                                    <Select
                                        labelId="school-select"
                                        label="University of Virginia School"
                                        value={selectSchool}
                                        onChange={(e) => setSelectedSchool(e.target.value)}
                                    >
                                        <MenuItem value={"college"}>College of Arts and Science</MenuItem>
                                        <MenuItem value={"engineering"}>School of Engineering and Applied Science</MenuItem>
                                        <MenuItem value={"commerce"}>McIntire School of Commerce</MenuItem>
                                        <MenuItem value={"architecture"}>School of Architecture</MenuItem>
                                        <MenuItem value={"wise"}>UVA's College at Wise</MenuItem>
                                        <MenuItem value={"medicine"}>School of Medicine</MenuItem>
                                        <MenuItem value={"law"}>School of Law</MenuItem>
                                        <MenuItem value={"business"}>Darden School of Business</MenuItem>
                                        <MenuItem value={"education"}>School of Education and Human Development</MenuItem>
                                        <MenuItem value={"professional"}>School of Continuing & Professional Studies</MenuItem>

                                    </Select>
                                </FormControl>
                            </Box>
                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexFlow: "column nowrap",
                                    gap: "4px"
                                }}
                            >
                                {/* <Input type="file" name="resume" onChange={changeResumeHandle} /> */}
                                <Button
                                    variant="contained"
                                    component="label"
                                    sx={{
                                        backgroundColor: "#f82249",
                                        color: "#fff",
                                        "&:hover": {
                                            backgroundColor: "#fff",
                                            color: "#f82249",
                                        }
                                    }}
                                >
                                    {progress < 100 ? "Upload Resume" : resumeName}
                                    <input
                                        type="file"
                                        hidden="true"
                                        accept="application/msword, application/pdf"
                                        onChange={(e) => changeResumeHandle(e)}
                                    />
                                </Button>
                                <LinearProgress variant="determinate" value={progress} />
                            </Box>
                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexFlow: "column",
                                    gap: "8px",
                                    boxSizing: "border-box",
                                }}
                            >
                                <Typography id="skills">
                                    What are some skills that you possess that you think would be helpful
                                    for Ideathon participants? This will be used primarily for team building. *
                                </Typography>
                                <TextField
                                    required
                                    id="skills"
                                    name="skills"
                                    variant="outlined"
                                    size="small"
                                    value={skills}
                                    autoComplete="skills"
                                    onChange={(e) => setSkills(e.target.value)}
                                />
                            </Box>
                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexFlow: "column",
                                    gap: "8px",
                                    boxSizing: "border-box",
                                }}
                            >
                                <Typography id="learn">
                                    What would you like to learn or get out of the Ideathon? *
                                </Typography>
                                <TextField
                                    required
                                    id="learn"
                                    name="learn"
                                    variant="outlined"
                                    size="small"
                                    value={learn}
                                    autoComplete="learn"
                                    onChange={(e) => setLearn(e.target.value)}
                                />
                            </Box>
                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexFlow: "column",
                                    gap: "8px"
                                }}
                            >
                                <FormGroup
                                >
                                    <InputLabel id="dietary-restriction">Dietary Restrictions</InputLabel>

                                    <FormControlLabel control={<CustomCheckbox onChange={selectRestrictions} />} label="Vegetarian" value="vegetarian" />
                                    <FormControlLabel control={<Checkbox onChange={selectRestrictions} />} label="Gluten Free" value="gluten-free" />
                                    <FormControlLabel control={<Checkbox onChange={selectRestrictions} />} label="Vegan" value="vegan" />
                                    <FormControlLabel control={<Checkbox onChange={selectRestrictions} />} label="Other" value="other" />
                                    {dietaryRestriction.includes("other") ? (
                                        <>
                                            <InputLabel id="dietary-specify-other">Specify Other Dietary Restriction</InputLabel>
                                            <TextField
                                                id="dietary-specify-other"
                                                name="dietary-specify-other"
                                                variant="outlined"
                                                size="small"
                                                type="text"
                                                value={otherDietaryRestriction}
                                                autoComplete="dietary-specify-other"
                                                onChange={(e) => setOtherDietaryRestriction(e.target.value)}
                                            />
                                        </>
                                    ) : null}

                                </FormGroup>
                            </Box>
                            <Button
                                sx={{
                                    backgroundColor: "#f82249",
                                    color: "#fff",
                                    boxShadow: 2,
                                    "&:hover": {
                                        transform: "scale3d(1.05, 1.05, 1)",
                                        backgroundColor: "#fff",
                                        color: "#f82249",
                                    }
                                }}
                                type="submit"
                                onClick={() => handleSubmit()}
                            >
                                Submit Registration
                            </Button>
                        </Card>
                    </Box>
                </Grid>
            </ThemeProvider>
        </>
    )
};

export default Registration;
