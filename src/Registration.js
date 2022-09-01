import React, {useState} from 'react';

// firebase 
import { database, storage } from './firebase';
import {ref,push,child,update} from "firebase/database";
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
    Input,
    Button,
} from '@mui/material';

const Registration = () => {

    // text-fields
    const [firstName, setFirstName] = useState();
    const [lastName, setLastName] = useState();
    const [email, setEmail] = useState();
    const [skills, setSkills] = useState();

    // upload file
    const [uploadResume, setUploadResume] = useState('Upload Resume');

    // dietary restrictions
    const [dietaryRestriction, setDietaryRestriction] = useState('none');

    // year
    const [selectYear, setSelectYear] = useState(1);

    // school
    const [selectSchool, setSelectedSchool] = useState('college');
    const [isSchoolSelected, setIsSchoolSelected] = useState(false);

    // resume upload
    const [selectedResume, setSelectedResume] = useState();
	const [isResumePicked, setIsResumePicked] = useState(false);

    // download url
    const [downloadURL, setDownloadURL] = useState();

    const changeResumeHandle = (event) => {
		setSelectedResume(event.target.files[0]);
        setUploadResume(event.target.files[0].name);
		setIsResumePicked(true);
	};

    async function handleSubmit () {

        // upload resume and get download url
        const storageReference = storageRef(storage, `/ideathon-resume/${selectYear}/${selectedResume.name}`);
        const uploadResume = uploadBytesResumable(storageReference, selectedResume);
        const url = await getDownloadURL(uploadResume.snapshot.ref);

        let applicant = {
            firstName: firstName,
            lastName: lastName,
            email: email,
            schoolYear: selectYear,
            uvaSchool: selectSchool,
            resume: url,
            skills: skills,
            dietaryRestriction: dietaryRestriction,
        };

        const newPostKey = push(child(ref(database), 'posts')).key;
        const updates = {};
        updates['/' + newPostKey] = applicant;
        return update(ref(database), updates);
    }


    return (
        <>
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
                        display: "flex",
                        flexFlow: "column nowrap",
                        width: "992px",
                        alignItems: "center",
                        backgroundColor: "#fff",
                        padding: "14px 18px",
                        gap: "16px",
                    }}
                >

                    <Typography>Ideathon Registration</Typography>

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
                            type={lastName}
                            autoComplete="last-name"
                            onChange={(e) => setLastName(e.target.value)}
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
                        <TextField
                            required
                            id="Email"
                            label="Email Address"
                            name="Email"
                            variant="outlined"
                            size="small"
                            type="email"
                            autoComplete="email"
                            onChange={(e) => setEmail(e.target.value)}
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
                        <Select
                            labelId="school-year-select"
                            label="Year"
                            value={selectYear}
                            onChange={(e) => setSelectYear(e.target.value)}
                        >
                            <MenuItem value={1}>1st Year</MenuItem>
                            <MenuItem value={2}>2nd Year</MenuItem>
                            <MenuItem value={3}>3rd Year</MenuItem>
                            <MenuItem value={4}>4th Year</MenuItem>
                        </Select>
                    </Box>
                    <Box
                        sx={{
                            width: "100%",
                            display: "flex",
                            flexFlow: "column nowrap",
                            gap: "8px"
                        }}
                    >
                        <InputLabel id="school-select">University of Virginia School</InputLabel>
                        <Select
                            labelId="school-select"
                            label="School"
                            // value={isSchoolSelected === false ? 'Select School' : selectSchool }
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
                    </Box>
                    <Box
                        sx={{
                            width: "100%",
                            display: "flex",
                            flexFlow: "column nowrap",
                            gap: "8px"
                        }}
                    >
                        {/* <Input type="file" name="resume" onChange={changeResumeHandle} /> */}
                        <Button
                        variant="contained"
                        component="label"
                        >
                            {uploadResume}
                            <input
                                type="file"
                                hidden="true"
                                accept="application/msword, application/pdf"
                                onChange={(e) => changeResumeHandle(e)}
                            />
                        </Button>
                    </Box>
                    <Box
                        sx={{
                            width: "100%",
                            display: "flex",
                            flexFlow: "column",
                            gap: "8px"
                        }}
                    >
                        <InputLabel id="skills">
                            What are some skills that you possess that you think would be helpful
                            for Ideathon participants? This will be used primarily for team building.
                        </InputLabel>
                        <TextField 
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
                            gap: "8px"
                        }}
                    >
                        <InputLabel id="dietary-restriction-select">Dietary Restrictions</InputLabel>
                        <Select
                            labelId="dietary-restriction-select"
                            label="Dietary Restrictions"
                            value={dietaryRestriction}
                            onChange={(e) => setDietaryRestriction(e.target.value)}
                        >
                            <MenuItem value={"none"}>None</MenuItem>
                            <MenuItem value={"vegetarian"}>Vegetarian</MenuItem>
                            <MenuItem value={"gluten-free"}>Gluten Free</MenuItem>
                            <MenuItem value={"vegan"}>Vegan</MenuItem>
                            <MenuItem value={"other"}>Other</MenuItem>
                        </Select>
                        {dietaryRestriction === "other" ? (
                            <>
                                <InputLabel id="specify-other">Specify Other Dietary Restriction</InputLabel>
                                <TextField />
                            </>
                        ) : null}
                    </Box>
                    <Button
                        sx={{
                            backgroundColor: ""
                        }}
                        type="submit"
                        onClick={() => handleSubmit()}
                    >
                        Submit
                    </Button>
                </Card>
            </Box>
        </>
    )
};

export default Registration;
