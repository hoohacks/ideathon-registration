import React, { useState } from "react";

// firebase
import { createUserWithEmailAndPassword } from "firebase/auth";
import { database, storage, auth } from "./firebase";
import { ref, update } from "firebase/database";
import { uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { ref as storageRef } from "firebase/storage"; // avoid naming issues

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
  FormControl,
  Grid,
  Link,
  FormHelperText,
} from "@mui/material";

// import logo
import Logo from "./images/logo.png";
import { EVENT, GRADUATION_YEARS } from "./eventInfo";

function joinList(items) {
  if (items.length < 2) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// email format
// \w{2,3} rejected every TLD longer than three characters, so nobody with a
// .tech / .info / .online address could register
const mailformat = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;

const Registration = () => {
  // text-fields
  const [firstName, setFirstName] = useState("");

  const [lastName, setLastName] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [isValidPassword, setIsValidPassword] = useState(true);

  const [skills, setSkills] = useState("");

  const [major, setMajor] = useState("");

  const [learn, setLearn] = useState("");

  // gender
  const [gender, setGender] = useState("");

  // email check
  const [isValidEmail, setIsValidEmail] = useState(true);

  // dietary restrictions
  const [dietaryRestriction, setDietaryRestriction] = useState("");

  // year
  const [selectYear, setSelectYear] = useState(GRADUATION_YEARS[0]);
  const otherSelectYear = "";

  // school
  const [selectSchool, setSelectedSchool] = useState("college");

  // resume upload
  const [resumeName, setResumeName] = useState();
  const [uploadResume, setUploadResume] = useState();
  const [progress, setProgress] = useState(0);

  // successful registration upload
  const [successRegistration, setSuccessRegistration] = useState(false);

  // validation messages stay hidden until the first submit attempt, so an
  // untouched form does not open covered in red
  const [showErrors, setShowErrors] = useState(false);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [skipResume, setSkipResume] = useState(false);
  const [errorString, setErrorString] = useState("");

  const changeResumeHandle = (event) => {
    if (!event.target.files[0]) return;

    const storageReference = storageRef(
      storage,
      `/ideathon-resume-${EVENT.year}/${selectYear}/${event.target.files[0].name}`
    );
    const uploadResumeToDB = uploadBytesResumable(
      storageReference,
      event.target.files[0]
    );

    uploadResumeToDB.on(
      "state_changed",
      (snapshot) => {
        setProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      },
      (error) => {
        console.error("Resume upload failed:", error);
      }
    );

    // set synchronously: waiting for the first progress event meant a quick
    // submit saw no upload task at all
    setUploadResume(uploadResumeToDB);
    setSkipResume(false);
    setResumeName(event.target.files[0].name);
  };

  function firstProblem() {
    // the form marks these required and renders red helper text for them, but
    // nothing ever stopped a submission with them empty
    const missing = [
      ["first name", firstName],
      ["last name", lastName],
      ["email", email],
      ["password", password],
      ["major/intended major", major],
      ["gender", gender],
      ["skills", skills],
      ["what you want to learn", learn],
    ]
      .filter(([, value]) => !String(value ?? "").trim())
      .map(([label]) => label);

    if (missing.length) {
      return `Please fill in your ${joinList(missing)} before submitting.`;
    }
    if (!isValidEmail) return "Please enter a valid email address.";
    if (!isValidPassword) return "Your password must be at least 6 characters.";
    return null;
  }

  async function handleSubmit() {
    if (submitting) return;

    const problem = firstProblem();
    if (problem) {
      setShowErrors(true);
      setErrorString(problem);
      setShowErrorPopup(true);
      return;
    }

    setSubmitting(true);
    try {
      // Wait for the resume upload to finish rather than checking whether a
      // progress counter happened to reach 100 by now. Submitting quickly used
      // to fall through to the no-resume branch and silently store "none".
      let resumeUrl = "none";
      if (uploadResume && !skipResume) {
        try {
          await uploadResume;
          resumeUrl = await getDownloadURL(uploadResume.snapshot.ref);
        } catch (error) {
          // the resume is optional, so a failed upload must not block signing
          // up -- but it must not vanish without a word either. Say so once,
          // then let a second press go through without it.
          console.error("Resume upload failed:", error);
          setSkipResume(true);
          setErrorString(
            "Your resume could not be uploaded. Press Submit Registration again to sign up without it, or choose a different file first."
          );
          setShowErrorPopup(true);
          return;
        }
      }

      let user = null;
      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        user = userCredential.user;
      } catch (error) {
        setErrorString(
          "Error signing up. An account with that email may already exist."
        );
        setShowErrorPopup(true);
        return;
      }

      const dietRestriction = dietaryRestriction;

      const applicant = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        schoolYear: selectYear === 0 ? otherSelectYear : selectYear,
        uvaSchool: selectSchool,
        resume: resumeUrl,
        skills: skills,
        gender: gender || null,
        learn: learn,
        major: major,
        registeredAt: new Date().toString(),
        checkedIn: false,
        foodCheckIn: false,
        dietaryRestriction: dietRestriction.length === 0 ? "none" : dietRestriction,
      };

      try {
        await update(ref(database), { ["/competitors/" + user.uid]: applicant });
        setSuccessRegistration(true);
      } catch (error) {
        // the account exists at this point, so failing quietly here left people
        // able to sign in with no profile and no idea why
        console.error("Could not save registration:", error);
        setErrorString(
          "Your account was created but your registration could not be saved. Please contact HooHacks before trying again."
        );
        setShowErrorPopup(true);
      }
    } finally {
      setSubmitting(false);
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
        <Popup open={successRegistration} modal>
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
            <Typography>{`You are signed up for ${EVENT.name} ${EVENT.year}.`}</Typography>
            <Link href="https://ideathon.hoohacks.io">
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
                View Schedule
              </Button>
            </Link>
          </Box>
        </Popup>
        <Popup open={showErrorPopup} modal>
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
            <Typography>{errorString}</Typography>
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
              onClick={() => setShowErrorPopup(false)}
            >
              Close
            </Button>
          </Box>
        </Popup>
        <Grid
          container
          spacing={0}
          direction="column"
          alignItems="center"
          justifyContent="center"
          style={{ minHeight: "100vh", minWidth: "100wh" }}
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
                display: "flex",
                flexFlow: "column nowrap",
                margin: "24px",
                width: "100%",
                maxWidth: "620px",
                alignItems: "center",
                backgroundColor: "#fff",
                padding: "22px 22px",
                gap: "16px",
                border: "none",
                boxShadow: "none",
              }}
            >
              {/* IDEATHON LOGO */}
              <Link
                href="https://ideathon.hoohacks.io"
                sx={{ display: "block", width: "100%", lineHeight: 0 }}
              >
                <Box
                  component="img"
                  src={Logo}
                  alt="HooHacks Ideathon logo"
                  sx={{
                    borderRadius: 1,
                    display: "block",
                    width: "100%",
                    height: "auto",
                  }}
                />
              </Link>

              <Typography sx={{ textAlign: "center" }}>
                The {EVENT.edition} {EVENT.name},{" "}
                <span style={{ fontWeight: "bold" }}>
                  {EVENT.dateLabel}
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
                sx={{
                  width: "100%",
                  display: "flex",
                  flexFlow: "row nowrap",
                  justifyContent: "center",
                  gap: "8px",
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
                  onChange={(e) => {
                    setFirstName(e.target.value.replace(/[^a-z]/gi, ""));
                  }}
                  error={showErrors && firstName === ""}
                  helperText={showErrors && firstName === "" ? "Enter your first name" : undefined}
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
                  onChange={(e) => {
                    setLastName(e.target.value.replace(/[^a-z]/gi, ""));
                  }}
                  error={showErrors && lastName === ""}
                  helperText={showErrors && lastName === "" ? "Enter your last name" : undefined}
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
                error={(showErrors && email === "") || !isValidEmail}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setIsValidEmail(mailformat.test(e.target.value));
                }}
                helperText={
                  showErrors && email === ""
                    ? "Enter your email"
                    : !isValidEmail
                    ? "That does not look like a valid email address"
                    : undefined
                }
              />
              <TextField
                fullWidth={true}
                required
                id="Password"
                label="Password"
                name="Password"
                variant="outlined"
                size="large"
                value={password}
                type="password"
                autoComplete="current-password"
                error={(showErrors && password === "") || !isValidPassword}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setIsValidPassword(e.target.value.length >= 6);
                }}
                helperText={
                  showErrors && password === ""
                    ? "Enter your password"
                    : !isValidPassword
                    ? "At least 6 characters"
                    : undefined
                }
              />
              <TextField
                fullWidth={true}
                required
                id="major"
                label="Major/Intended Major"
                name="major"
                variant="outlined"
                value={major}
                size="large"
                type="text"
                autoComplete="major"
                onChange={(e) => {
                  setMajor(e.target.value);
                }}
                error={showErrors && major === ""}
                  helperText={showErrors && major === "" ? "Enter your major" : undefined}
              />
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexFlow: "column nowrap",
                  gap: "8px",
                }}
              >
                <FormControl size="large">
                  <InputLabel>Gender</InputLabel>
                  <Select
                    labelId="gender-select"
                    label="Gender"
                    value={gender}
                    size="large"
                    onChange={(e) => {
                      setGender(e.target.value);
                    }}
                  >
                    <MenuItem value="male">Male</MenuItem>
                    <MenuItem value="female">Female</MenuItem>
                    <MenuItem value="other">Other</MenuItem>
                    <MenuItem value="prefer-not-to-say">
                      Prefer not to say
                    </MenuItem>
                  </Select>
                  {showErrors && gender === "" ? (
                    <FormHelperText sx={{ color: "red", fontSize: "11px" }}>
                      Please select an option
                    </FormHelperText>
                  ) : null}
                </FormControl>
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexFlow: "column nowrap",
                  gap: "8px",
                }}
              >
                <FormControl size="small">
                  <InputLabel>Expected Graduation Date</InputLabel>
                  <Select
                    labelId="school-year-select"
                    label="Expected Graduation Year"
                    value={selectYear}
                    size="large"
                    onChange={(e) => setSelectYear(e.target.value)}
                  >
                    {GRADUATION_YEARS.map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexFlow: "column nowrap",
                  gap: "4px",
                }}
              >
                <FormControl size="small">
                  <InputLabel id="school-select">
                    University of Virginia School
                  </InputLabel>
                  <Select
                    labelId="school-select"
                    label="University of Virginia School"
                    value={selectSchool}
                    size="large"
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
                sx={{
                  width: "100%",
                  display: "flex",
                  flexFlow: "column nowrap",
                  gap: "4px",
                }}
              >
                <Button
                  variant="contained"
                  component="label"
                  sx={{
                    backgroundColor: "#f82249",
                    color: "#fff",
                    "&:hover": {
                      backgroundColor: "#fff",
                      color: "#f82249",
                      border: "1px solid",
                      borderColor: "#f82249",
                    },
                  }}
                >
                  {progress < 100 ? "Optional - Upload Resume" : resumeName}
                  <input
                    type="file"
                    size="large"
                    hidden={true}
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
                  What are some skills that you possess that you think would be
                  helpful for Ideathon participants? This will be used primarily
                  for team building. *
                </Typography>

                <TextField
                  fullWidth={true}
                  required
                  id="skills"
                  name="skills"
                  variant="outlined"
                  size="large"
                  label="My skills are..."
                  multiline
                  type="text"
                  maxRows={Infinity}
                  value={skills}
                  autoComplete="skills"
                  onChange={(e) => {
                    setSkills(e.target.value);
                  }}
                  error={showErrors && skills === ""}
                  helperText={showErrors && skills === "" ? "Enter your skills or N/A" : undefined}
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
                  size="large"
                  label="I would like to learn..."
                  multiline
                  maxRows={Infinity}
                  value={learn}
                  autoComplete="learn"
                  onChange={(e) => {
                    setLearn(e.target.value);
                  }}
                  error={showErrors && learn === ""}
                  helperText={showErrors && learn === "" ? "Enter something you would like to learn or N/A" : undefined}
                />
              </Box>
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexFlow: "column nowrap",
                  gap: "8px",
                }}
              >
                <FormControl size="large">
                  <InputLabel>Dietary Restrictions</InputLabel>
                  <Select
                    labelId="dietary-restriction-select"
                    label="Dietary Restrictions"
                    value={dietaryRestriction}
                    size="large"
                    onChange={(e) => {
                      setDietaryRestriction(e.target.value);
                    }}
                  >
                    <MenuItem value="vegetarian">Vegetarian</MenuItem>
                    <MenuItem value="gluten-free">Gluten Free</MenuItem>
                    <MenuItem value="vegan">Vegan</MenuItem>
                    <MenuItem value="none">None</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  flexFlow: "row nowrap",
                  gap: "16px",
                }}
              >
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
                  type="submit"
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Registration"}
                </Button>

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
                      },
                    }}
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
    </>
  );
};

export default Registration;
