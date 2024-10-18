import React, { useState } from "react";

// firebase
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { child, push, ref, update } from "firebase/database";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from "firebase/storage";
import { database, storage } from "./firebase";

// react pop up
import { Popup } from "reactjs-popup";
import "reactjs-popup/dist/index.css";

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
  FormHelperText,
} from "@mui/material";

// import more styling
import { theme, popupStyles, gridStyles } from "./styles/registrationStyles.tsx"

// import configs
import configs from "./configs/textFieldConfig.tsx"

// import components
import RegistrationStatusModal from './components/RegistrationStatusModal.tsx';
import IdeathonLogo from './components/IdeathonLogo.tsx';

import { ThemeProvider, createTheme } from "@mui/material/styles";

// email format
const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

const Registration = () => {
  // text-fields
  const [firstName, setFirstName] = useState("");
  const [firstNameCheck, setFirstNameCheck] = useState(false);
  const [lastName, setLastName] = useState("");
  const [lastNameCheck, setLastNameCheck] = useState(false);
  const [email, setEmail] = useState("");
  const [emailCheck, setEmailCheck] = useState(false);
  const [skills, setSkills] = useState("");
  const [skillsCheck, setSkillsCheck] = useState(false);
  const [major, setMajor] = useState("");
  const [majorCheck, setMajorCheck] = useState(false);
  const [learn, setLearn] = useState("");
  const [learnCheck, setLearnCheck] = useState(false);

  // gender
  const [gender, setGender] = useState(null);
  const [genderCheck, setGenderCheck] = useState(false);

  // email check
  const [isValidEmail, setIsValidEmail] = useState(true);

  // dietary restrictions
  const [dietaryRestriction, setDietaryRestriction] = useState([]);
  const [otherDietaryRestriction, setOtherDietaryRestriction] = useState("");
  const [otherDietaryRestrictionCheck, setOtherDietaryRestrictionCheck] =
    useState(false);

  // year
  const [selectYear, setSelectYear] = useState(2024);
  const [otherSelectYear, setOtherSelectYear] = useState("");
  const [otherSelectYearCheck, setOtherSelectYearCheck] = useState("");

  // school
  const [selectSchool, setSelectedSchool] = useState("college");

  // resume upload
  const [resumeName, setResumeName] = useState();
  const [uploadResume, setUploadResume] = useState();
  const [isResumePicked, setIsResumePicked] = useState(false);
  const [progress, setProgress] = useState(0);

  // successful registration upload
  const [successRegistration, setSuccessRegistration] = useState(false);

  const changeResumeHandle = (event) => {
    const storageReference = storageRef(
      storage,
      `/ideathon-resume-2024/${selectYear}/${event.target.files[0].name}`
    );
    const uploadResumeToDB = uploadBytesResumable(
      storageReference,
      event.target.files[0]
    );

    uploadResumeToDB.on("state_changed", (snapshot) => {
      setProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      setUploadResume(uploadResumeToDB);
    });

    setResumeName(event.target.files[0].name);
    setIsResumePicked(true);
  };

  // add multiple dietary restrictions
  const selectRestrictions = (event) => {
    if (dietaryRestriction.includes(event.target.value)) {
      setDietaryRestriction((current) =>
        current.filter((diet) => diet !== event.target.value)
      );
    } else {
      setDietaryRestriction((current) => [...current, event.target.value]);
    }
  };

  async function handleSubmit() {
    // update dietary restrictions with other value
    var dietRestriction = dietaryRestriction;
    if (otherDietaryRestriction !== "") {
      dietRestriction.push(otherDietaryRestriction);
    }

    // checks if resume has been uploaded yet or not
    if (progress === 100 && isResumePicked) {
      // download url
      const url = await getDownloadURL(uploadResume.snapshot.ref);

      let applicant = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        schoolYear: selectYear === 0 ? otherSelectYear : selectYear,
        uvaSchool: selectSchool,
        resume: url,
        skills: skills,
        gender: gender,
        learn: learn,
        major: major,
        registeredAt: firebase.firestore.Timestamp.now().toDate().toString(),
        checkedIn: false,
        dietaryRestriction:
          dietRestriction.length === 0 ? "none" : dietRestriction,
      };

      const newPostKey = push(child(ref(database), "posts")).key;
      const updates = {};
      updates["/" + newPostKey] = applicant;
      return update(ref(database), updates)
        .then(() => setSuccessRegistration(true))
        .catch((error) => {
          console.warn(error);
        });
    } else {
      // for when no resume is selected

      let applicant = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        schoolYear: selectYear === 0 ? otherSelectYear : selectYear,
        uvaSchool: selectSchool,
        resume: "none",
        skills: skills,
        gender: gender,
        learn: learn,
        major: major,
        registeredAt: firebase.firestore.Timestamp.now().toDate().toString(),
        checkedIn: false,
        dietaryRestriction:
          dietRestriction.length === 0 ? "none" : dietRestriction,
      };

      const newPostKey = push(child(ref(database), "posts")).key;
      const updates = {};
      updates["/" + newPostKey] = applicant;
      return update(ref(database), updates)
        .then(() => setSuccessRegistration(true))
        .catch((error) => {
          console.warn(error);
        });
    }
  }

  function Copyright() {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
        align="center"
        sx={{ marginTop: "10px" }}
      >
        {"Copyright © "}
        <Link color="inherit" href="https://ideathon.hoohacks.io">
          Hoohacks Ideathon
        </Link>{" "}
        {new Date().getFullYear()}
      </Typography>
    );
  }

  return (
    <>
      <ThemeProvider theme={theme}>
      <RegistrationStatusModal 
        isOpen={successRegistration} 
        onClose={() => setSuccessRegistration(false)}
      />
        <Grid
          container
          style={gridStyles.main}
        >
          <Box
            sx={gridStyles.box}
          >
            <Card
              sx={{
                ...gridStyles.card,
                [theme.breakpoints.down("md")]: {
                  margin: "0",
                }
              }}
            >
              <IdeathonLogo theme={theme} />

              <Typography sx={{ textAlign: "center" }}>
                The fifth annual Ideathon,{" "}
                <span style={{ fontWeight: "bold" }}>
                  Sunday October 27, 2024
                </span>
                , is a networking, team-building, and pitching event designed to
                help students with technical experience and students with
                business experience build their technical business ideas.
                Student teams can meet 1:1 with industry experts about their
                ideas and form long lasting relationships with them as they
                continue to grow their ideas. Corporate sponsors will be holding
                workshops to teach students about pitching their ideas, valuing
                their potential businesses, and building technical prototypes.
                There will be a two hour pitch event, where teams will pitch to
                a board of sponsors for funding. Teams will have the opportunity
                to win thousands of dollars in funding in order to bring their
                idea to fruition!
              </Typography>

              <Box
                sx={gridStyles.box2}
              >
                <TextField
                  {... configs.firstNameConfig}
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value.replace(/[^a-z]/gi, ""));
                    setFirstNameCheck(firstName !== "");
                  }}
                  helperText={
                    firstName === "" && (
                      <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                        Enter your first name
                      </Typography>
                    )
                  }
                />
                <TextField
                  {... configs.lastNameConfig}
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value.replace(/[^a-z]/gi, ""));
                    setLastNameCheck(lastName !== "");
                  }}
                  helperText={
                    lastName === "" && (
                      <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                        Enter your last name
                      </Typography>
                    )
                  }
                />
              </Box>
              <TextField
                {... configs.emailConfig}
                error={!isValidEmail}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailCheck(email !== "");
                  setIsValidEmail(mailformat.test(email));
                }}
                helperText={
                  (email === "" && (
                    <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                      Enter your email
                    </Typography>
                  )) ||
                  (!isValidEmail && (
                    <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                      Invalid Email Format
                    </Typography>
                  ))
                }
              />
              <TextField
                {... configs.majorConfig}
                value={major}
                onChange={(e) => {
                  setMajor(e.target.value);
                  setMajorCheck(e.target.value !== "");
                }}
                helperText={
                  major === "" && (
                    <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                      Enter your major
                    </Typography>
                  )
                }
              />
              <Box
                sx={gridStyles.box3}
              >
                <FormGroup>
                  <InputLabel id="gender">Gender</InputLabel>
                  <RadioGroup
                    name="gender-select"
                    onChange={(e) => {
                      setGender(e.target.value);
                      setGenderCheck(e.target.value !== null);
                    }}
                  >
                    <FormControlLabel
                      hidden={true}
                      control={<Radio />}
                      label="Male"
                      value="male"
                    />
                    <FormControlLabel
                      hidden={true}
                      control={<Radio />}
                      label="Female"
                      value="female"
                    />
                    <FormControlLabel
                      hidden={true}
                      control={<Radio />}
                      label="Other"
                      value="other"
                    />
                    <FormControlLabel
                      hidden={true}
                      control={<Radio />}
                      label="Prefer not to say"
                      value="prefer-not-to-say"
                    />
                  </RadioGroup>

                  {gender == null ? (
                    <FormHelperText sx={{ color: "red", fontSize: "11px" }}>
                      Please select an option
                    </FormHelperText>
                  ) : null}
                </FormGroup>
              </Box>
              <Box
                sx={gridStyles.box4}
              >
                <FormControl size="small">
                  <InputLabel>Expected Graduation Date</InputLabel>
                  <Select
                    {... configs.schoolLabelConfig}
                    value={selectYear}
                    onChange={(e) => setSelectYear(e.target.value)}
                  >
                    <MenuItem value={2025}>2025</MenuItem>
                    <MenuItem value={2026}>2026</MenuItem>
                    <MenuItem value={2027}>2027</MenuItem>
                    <MenuItem value={2028}>2028</MenuItem>
                    <MenuItem value={0}>Other</MenuItem>
                  </Select>
                  {selectYear === 0 ? (
                    <>
                      <TextField
                        {... configs.yearLabelConfig}
                        sx={{ marginTop: "8px" }}
                        value={otherSelectYear}
                        onChange={(e) => {
                          setOtherSelectYear(e.target.value.replace(/\D/g, ""));
                          setOtherSelectYearCheck(e.target.value !== "");
                        }}
                        helperText={
                          otherSelectYear === "" && (
                            <Typography
                              sx={{ color: "#f82249", fontSize: "11px" }}
                            >
                              Enter your expected graduation year
                            </Typography>
                          )
                        }
                      />
                    </>
                  ) : null}
                </FormControl>
              </Box>
              <Box
                sx={gridStyles.box5}
              >
                <FormControl size="small">
                  <InputLabel id="school-select">
                    University of Virginia School
                  </InputLabel>
                  <Select
                    {... configs.schoolSelectConfig}
                    value={selectSchool}
                    onChange={(e) => setSelectedSchool(e.target.value)}
                  >
                    <MenuItem value={"college"}>
                      College of Arts and Science
                    </MenuItem>
                    <MenuItem value={"engineering"}>
                      School of Engineering and Applied Science
                    </MenuItem>
                    <MenuItem value={"commerce"}>
                      McIntire School of Commerce
                    </MenuItem>
                    <MenuItem value={"architecture"}>
                      School of Architecture
                    </MenuItem>
                    <MenuItem value={"wise"}>UVA's College at Wise</MenuItem>
                    <MenuItem value={"medicine"}>School of Medicine</MenuItem>
                    <MenuItem value={"law"}>School of Law</MenuItem>
                    <MenuItem value={"business"}>
                      Darden School of Business
                    </MenuItem>
                    <MenuItem value={"education"}>
                      School of Education and Human Development
                    </MenuItem>
                    <MenuItem value={"professional"}>
                      School of Continuing & Professional Studies
                    </MenuItem>
                    <MenuItem value={"other"}>Don't go to UVA</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Box
                sx={gridStyles.box5}
              >
                <Button
                  variant="contained"
                  component="label"
                  sx={gridStyles.button}
                >
                  {progress < 100 ? "Optional - Upload Resume" : resumeName}
                  <input
                    {... configs.applicationConfig}
                    hidden={true}
                    onChange={(e) => changeResumeHandle(e)}
                  />
                </Button>
                <LinearProgress variant="determinate" value={progress} />
              </Box>
              <Box
                sx={gridStyles.box6}
              >
                <Typography id="skills">
                  What are some skills that you possess that you think would be
                  helpful for Ideathon participants? This will be used primarily
                  for team building. *
                </Typography>
                <TextField
                  {... configs.skillsConfig}
                  value={skills}
                  onChange={(e) => {
                    setSkills(e.target.value);
                    setSkillsCheck(e.target.value !== "");
                  }}
                  helperText={
                    skills === "" && (
                      <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                        Enter your skills or N/A
                      </Typography>
                    )
                  }
                />
              </Box>
              <Box
                sx={gridStyles.box6}
              >
                <Typography id="learn">
                  What would you like to learn or get out of the Ideathon? *
                </Typography>
                <TextField
                  {... configs.learnConfig}
                  value={learn}
                  onChange={(e) => {
                    setLearn(e.target.value);
                    setLearnCheck(e.target.value !== "");
                  }}
                  helperText={
                    learn === "" && (
                      <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                        Enter something you would like to learn or N/A
                      </Typography>
                    )
                  }
                />
              </Box>
              <Box
                sx={gridStyles.box6}
              >
                <FormGroup>
                  <InputLabel id="dietary-restriction">
                    Dietary Restrictions
                  </InputLabel>

                  <FormControlLabel
                    hidden={true}
                    control={<Checkbox onChange={selectRestrictions} />}
                    label="Vegetarian"
                    value="vegetarian"
                  />
                  <FormControlLabel
                    hidden={true}
                    control={<Checkbox onChange={selectRestrictions} />}
                    label="Gluten Free"
                    value="gluten-free"
                  />
                  <FormControlLabel
                    hidden={true}
                    control={<Checkbox onChange={selectRestrictions} />}
                    label="Vegan"
                    value="vegan"
                  />
                  <FormControlLabel
                    hidden={true}
                    control={<Checkbox onChange={selectRestrictions} />}
                    label="Other"
                    value="other"
                  />
                  {dietaryRestriction.includes("other") ? (
                    <>
                      <InputLabel id="dietary-specify-other">
                        Specify Other Dietary Restriction
                      </InputLabel>
                      <TextField
                        {... configs.dietConfig}
                        value={otherDietaryRestriction}
                        onChange={(e) => {
                          setOtherDietaryRestriction(e.target.value);
                          setOtherDietaryRestrictionCheck(
                            e.target.value !== ""
                          );
                        }}
                        helperText={
                          !otherDietaryRestrictionCheck && (
                            <Typography
                              sx={{ color: "#f82249", fontSize: "11px" }}
                            >
                              Enter Your Dietary Restriction
                            </Typography>
                          )
                        }
                      />
                    </>
                  ) : null}
                </FormGroup>
              </Box>
              <Box
                sx={gridStyles.box7}
              >
                {firstNameCheck &&
                lastNameCheck &&
                isValidEmail &&
                emailCheck &&
                majorCheck &&
                skillsCheck &&
                genderCheck &&
                learnCheck &&
                (selectYear === 0 ? otherSelectYearCheck : true) &&
                (dietaryRestriction.includes("other")
                  ? otherDietaryRestrictionCheck
                  : true) ? (
                  <Button
                    sx={gridStyles.button2}
                    type="submit"
                    onClick={() => handleSubmit()}
                  >
                    Submit Registration
                  </Button>
                ) : (
                  <Popup
                    trigger={
                      <Button
                        sx={gridStyles.button2}
                        type="submit"
                      >
                        Submit Registration
                      </Button>
                    }
                    on="hover"
                    position="top center"
                  >
                    <Box
                      sx={gridStyles.popupBox}
                    >
                      <Typography>
                        Please fill out the remaining fields.
                      </Typography>
                    </Box>
                  </Popup>
                )}

                <Link href="https://ideathon.hoohacks.io">
                  <Button
                    sx={gridStyles.button3}
                    type="button"
                  >
                    Cancel
                  </Button>
                </Link>
              </Box>
              {/* <Box
                                sx={{
                                    width: "100%",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    marginLeft: "auto",
                                    marginRight: "auto",
                                    textAlign: "center",
                                    display: "flex",
                                }}
                            >
                                <Typography >
                                    Registration for Ideathon has ended!!!! Please reach out to <Link href="mailto:hackathon.virginia@gmail.com">hackathon.virginia@gmail.com</Link> for additional questions.
                                </Typography>
                            </Box> */}
            </Card>
          </Box>
          <Copyright />
        </Grid>
      </ThemeProvider>
    </>
  );
};

export default Registration;
