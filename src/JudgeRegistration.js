import React, { isValidElement, useState } from "react";

// firebase
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { database, storage, auth } from "./firebase";
import { ref, push, child, update } from "firebase/database";
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
  Checkbox,
  FormControlLabel,
  FormLabel,
  FormGroup,
  FormControl,
  Grid,
  Link,
  RadioGroup,
  Radio,
  FormHelperText,
} from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// import logo
import Logo from "./images/logo.png";
import { maxWidth } from "@mui/system";
import { FormText } from "react-bootstrap";

// email format
const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

const JudgeRegistration = () => {
  // theme
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

  // text-fields
  const [firstName, setFirstName] = useState("");
  const [firstNameCheck, setFirstNameCheck] = useState(false);

  const [lastName, setLastName] = useState("");
  const [lastNameCheck, setLastNameCheck] = useState(false);

  const [email, setEmail] = useState("");
  const [emailCheck, setEmailCheck] = useState(false);

  const [password, setPassword] = useState("");
  const [passwordCheck, setPasswordCheck] = useState(false);
  const [isValidPassword, setIsValidPassword] = useState(true);

  const [withCompany, setWithCompany] = useState(false);

  const [company, setCompany] = useState("");

  const [wantsToMentor, setWantsToMentor] = useState(false);

  const timing_strs = [
    "11:00 AM",
    "12:00 PM",
    "1:00 PM",
    "2:00 PM",
    "3:00 PM",
    "4:00 PM",
  ];

  const [timings, setTimings] = useState([
    false,
    false,
    false,
    false,
    false,
    false,
  ]);

  const skills_strs = [
    "Android Studio",
    "Angular",
    "AWS",
    "Azure",
    "C",
    "CSS",
    "C++",
    "C#/ASP.NET",
    "Django",
    "echoAR",
    "Firebase",
    "Flutter",
    "GCP",
    "Git",
    "Google Maps API",
    "HTML",
    "Idea Generation",
    "iOS Mobile App Development",
    "Java",
    "JavaScript",
    "jQuery",
    "Machine Learning",
    "MaxMSP",
    "Node.js",
    "Perl",
    "Pitching",
    "Python",
    "React",
    "Ruby/Rails",
    "SQL",
    "Unity",
    "Other VR technology",
    "Vue.js",
  ];

  const [skills, setSkills] = useState(Array(skills_strs.length).fill(false));

  const toggleBool = (index, stateFunc) => {
    stateFunc((prev) => prev.map((value, i) => (i === index ? !value : value)));
  };

  const [wantsToJudge, setWantsToJudge] = useState(false);

  const [questionsAndConcerns, setQuestionsAndConcerns] = useState("");

  // email check
  const [isValidEmail, setIsValidEmail] = useState(true);

  // successful registration upload
  const [successRegistration, setSuccessRegistration] = useState(false);

  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [errorString, setErrorString] = useState(false);

  async function handleSubmit() {
    const checkSlots = () => {
      if (wantsToMentor) {
        let count = 0;
        for (let i = 0; i < timings.length; i++) {
          if (timings[i]) {
            count++;
          }
        }
        if (count >= 2) {
          return true;
        }
        return false;
      }
      return true;
    };
    // form validation
    if (!isValidEmail || !isValidPassword) {
      setErrorString(
        "Please enter a valid email and ensure your password is at least 6 characters."
      );
      setShowErrorPopup(true);
      return;
    }

    if (!checkSlots()) {
      setErrorString("Please select at least two time slots.");
      setShowErrorPopup(true);
      return;
    }

    // Sign in user with email and password
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
        "Error signing up. User already exists or email is invalid."
      );
      setShowErrorPopup(true);
      return;
    }

    let timeslots = timing_strs.filter((_, i) => timings[i]);
    let selected_skills = skills_strs.filter((_, i) => skills[i]);

    let judge = {
      firstName: firstName,
      lastName: lastName,
      email: email,
      withCompany: withCompany,
      company: company,
      wantsToMentor: wantsToMentor,
      timeslots: timeslots,
      skills: selected_skills,
      wantsToJudge: wantsToJudge,
      questionsAndConcerns: questionsAndConcerns,
      registeredAt: firebase.firestore.Timestamp.now().toDate().toString(),
      checkedIn: false,
      isJudge: true,
    };

    const updates = {};
    updates["/judges/" + user.uid] = judge;
    return update(ref(database), updates)
      .then(() => setSuccessRegistration(true))
      .catch((error) => {
        console.warn(error);
      });
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
            <Typography>Successfully signed up for Ideathon 25!</Typography>
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
                [theme.breakpoints.down("md")]: {
                  margin: "0",
                },
              }}
            >
              {/* IDEATHON LOGO */}
              <Link
                href="https://ideathon.hoohacks.io"
                sx={{
                  maxWidth: "582px",
                  [theme.breakpoints.down("md")]: {
                    maxWidth: "402px",
                  },
                }}
              >
                <img
                  src={Logo}
                  style={{
                    borderRadius: "5px",
                    width: "582px",
                    objectFit: "cover",
                    [theme.breakpoints.down("md")]: {
                      width: "402px",
                    },
                  }}
                />
              </Link>

              <Typography sx={{ textAlign: "center" }}>
                The fifth annual Ideathon,{" "}
                <span style={{ fontWeight: "bold" }}>
                  Sunday, October 19, 2025
                </span>
                <Typography>
                  Ideathon is a networking, team-building, and pitching event
                  designed to help students with technical experience and
                  students with business experience build their technical
                  business ideas together. Mentors help our students form their
                  ideas and craft a pitch throughout the day in minimum 2-hour
                  shifts. Judges will evaluate and score the teams’ pitches from
                  5:00 PM - 7:00 PM. We would appreciate it if you could be a
                  mentor and/or judge! The event itself is Sunday, October 19th
                  from 10:00 AM - 7:00 PM at Rice Hall, but you do not have to
                  stay for the entire event! Fill out this form if you would
                  like to help out. Thank you!
                </Typography>
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
                error={!isValidEmail}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailCheck(email !== "");
                  setIsValidEmail(mailformat.test(email));
                }}
                helperText={
                  email === "" && (
                    <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                      Enter your email
                    </Typography>
                  )
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
                error={!isValidPassword}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordCheck(password !== "");
                  setIsValidPassword(password.length >= 6);
                }}
                helperText={
                  password === "" && (
                    <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                      Enter your password (6 characters minimum)
                    </Typography>
                  )
                }
              />
              <Box
                sx={{
                  display: "flex",
                  flexFlow: "column nowrap",
                  gap: "10px",
                }}
              >
                <hr />
                <Typography>
                  Are you mentoring/judging on behalf of a company that is
                  sponsoring the Ideathon?
                </Typography>
                <RadioGroup>
                  <FormControlLabel
                    control={
                      <Radio
                        checked={withCompany}
                        onChange={(event) => {
                          setWithCompany(true);
                        }}
                        color="primary"
                      />
                    }
                    label="Yes"
                  />
                  <FormControlLabel
                    control={
                      <Radio
                        checked={!withCompany}
                        onChange={(event) => {
                          setWithCompany(false);
                        }}
                        color="primary"
                      />
                    }
                    label="No"
                  />
                </RadioGroup>
                {withCompany ? (
                  <>
                    <TextField
                      fullWidth={true}
                      required
                      id="company"
                      name="company"
                      label="Company"
                      variant="outlined"
                      value={company}
                      type="text"
                      size="large"
                      autoComplete="company"
                      onChange={(e) => {
                        setCompany(e.target.value);
                      }}
                    />
                  </>
                ) : null}
                <hr />
              </Box>
              <Box
                sx={{
                  display: "flex",
                  flexFlow: "column nowrap",
                  gap: "10px",
                }}
              >
                <Typography>
                  Mentors help our students form their ideas and craft a pitch
                  throughout the day in shifts. Shifts are 1 hour each.
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={wantsToMentor}
                      onChange={() => {
                        setWantsToMentor(!wantsToMentor);
                      }}
                      color="primary"
                    />
                  }
                  label=" Would you like to mentor for the Ideathon?"
                />
                {wantsToMentor ? (
                  <>
                    <p>
                      Please select at least 2 shifts you are available for.
                      Shifts are 1 hour.
                    </p>
                    {timing_strs.map((str, index) => (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={timings[index]}
                            onChange={() => {
                              toggleBool(index, setTimings);
                            }}
                            color="primary"
                          />
                        }
                        label={timing_strs[index]}
                      />
                    ))}
                  </>
                ) : null}
                {wantsToMentor ? (
                  <>
                    <Typography>
                      Please select all the skills you are comfortable mentoring
                      in.
                    </Typography>
                    {skills_strs.map((str, index) => (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={skills[index]}
                            onChange={() => {
                              toggleBool(index, setSkills);
                            }}
                            color="primary"
                          />
                        }
                        label={str}
                      />
                    ))}
                  </>
                ) : null}
                <Typography>
                  Judges will evaluate and score the teams’ pitches from 5:00 pm
                  - 7:00 pm.
                </Typography>
                <Typography>
                  Would you like to judge for the Ideathon?
                </Typography>
                <RadioGroup>
                  <FormControlLabel
                    control={
                      <Radio
                        checked={wantsToJudge}
                        onChange={(event) => {
                          setWantsToJudge(true);
                        }}
                        color="primary"
                      />
                    }
                    label="Yes"
                  />
                  <FormControlLabel
                    control={
                      <Radio
                        checked={!wantsToJudge}
                        onChange={(event) => {
                          setWantsToJudge(false);
                        }}
                        color="primary"
                      />
                    }
                    label="No"
                  />
                </RadioGroup>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  flexFlow: "column nowrap",
                  gap: "10px",
                }}
              >
                <Typography>
                  Do you have any questions or concerns? Feel free to include
                  them here or send us an email at{" "}
                  <a href="mailto:hackathon.virginia@gmail.com">
                    hackathon.virginia@gmail.com
                  </a>
                  . Thank you for filling out this form!
                </Typography>
                <TextField
                  fullWidth={true}
                  id="Questions"
                  label="Questions/Concerns?"
                  name="Email"
                  variant="outlined"
                  size="large"
                  value={questionsAndConcerns}
                  onChange={(e) => {
                    setQuestionsAndConcerns(e.target.value);
                  }}
                />
              </Box>
              <Box
                sx={{
                  display: "flex",
                  flexFlow: "row nowrap",
                  gap: "10px",
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
                >
                  Submit Registration
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
      </ThemeProvider>
    </>
  );
};

export default JudgeRegistration;
