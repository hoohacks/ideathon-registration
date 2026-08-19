import React, { useState } from "react";

// firebase
import { createUserWithEmailAndPassword } from "firebase/auth";
import { database, auth } from "./firebase";
import { ref, update, serverTimestamp } from "firebase/database";

// react pop up
import { Popup } from "reactjs-popup";
import "reactjs-popup/dist/index.css";

// import mui styling
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Checkbox,
  FormControlLabel,
  Grid,
  Link,
  RadioGroup,
  Radio,
} from "@mui/material";

// import logo
import Logo from "./images/logo.png";
import { EVENT } from "./eventInfo";

function joinList(items) {
  if (items.length < 2) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// email format
// \w{2,3} rejected every TLD longer than three characters, so nobody with a
// .tech / .info / .online address could register
const mailformat = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;

const JudgeRegistration = () => {
  // text-fields
  const [firstName, setFirstName] = useState("");

  const [lastName, setLastName] = useState("");

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
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

  // validation messages stay hidden until the first submit attempt, so an
  // untouched form does not open covered in red
  const [showErrors, setShowErrors] = useState(false);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorString, setErrorString] = useState("");

  async function handleSubmit() {
    if (submitting) return;

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
    // the form marks these required but nothing enforced it before
    const missing = [
      ["first name", firstName],
      ["last name", lastName],
      ["email", email],
      ["password", password],
      ...(withCompany ? [["company", company]] : []),
    ]
      .filter(([, value]) => !String(value ?? "").trim())
      .map(([label]) => label);

    if (missing.length) {
      setShowErrors(true);
      setErrorString(`Please fill in your ${joinList(missing)} before submitting.`);
      setShowErrorPopup(true);
      return;
    }

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
      registeredAt: serverTimestamp(),
      checkedIn: false,
      foodCheckIn: false,
    };

    try {
      setSubmitting(true);
      await update(ref(database), { ["/judges/" + user.uid]: judge });
      setSuccessRegistration(true);
    } catch (error) {
      // the account exists by now, so failing quietly here left judges able to
      // sign in with no profile and no idea why
      console.error("Could not save judge registration:", error);
      setErrorString(
        "Your account was created but your registration could not be saved. Please contact HooHacks before trying again."
      );
      setShowErrorPopup(true);
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

              <Typography component="div" sx={{ textAlign: "center" }}>
                The {EVENT.edition} {EVENT.name},{" "}
                <span style={{ fontWeight: "bold" }}>
                  {EVENT.dateLabel}
                </span>
                <Typography>
                  Ideathon is a networking, team-building, and pitching event
                  designed to help students with technical experience and
                  students with business experience build their technical
                  business ideas together. Mentors help our students form their
                  ideas and craft a pitch throughout the day in minimum 2-hour
                  shifts. Judges will evaluate and score the teams’ pitches from{" "}
                  {EVENT.judgingHours}. We would appreciate it if you could be a
                  mentor and/or judge! The event itself is {EVENT.dateLabel}{" "}
                  from {EVENT.hours} at {EVENT.venue}, but you do not have to
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
    </>
  );
};

export default JudgeRegistration;
