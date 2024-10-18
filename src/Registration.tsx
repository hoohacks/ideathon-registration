import React, { useState } from "react";

// firebase
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { child, push, ref, update, set} from "firebase/database";
import { getDownloadURL, ref as storageRef, uploadBytesResumable, UploadTask } from "firebase/storage";
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
import { ThemeProvider, createTheme } from "@mui/material/styles";

// import logo
import Logo from "./images/logo.png";
import { maxWidth } from "@mui/system";

// email format
const mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

interface FormField {
    value: string | Array<string> | number
    isEmpty: boolean
}

interface EmailField extends FormField {
    isValid: boolean
}

interface ResumeField extends FormField {
    url: UploadTask | null
    progress: number

}

interface ApplicantForm {
    firstName: FormField
    lastName: FormField
    email: EmailField
    skills: FormField
    major: FormField
    learn: FormField
    gender: FormField
    dietaryRestriction: FormField
    year: FormField
    school: FormField
    resume: ResumeField
    registeredAt: string
    checkedIn: boolean
}


const Registration = () => {
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

  const [applicant, setApplicant] = useState<ApplicantForm>({
        firstName: { value: "", isEmpty: true },
        lastName: { value: "", isEmpty: true },
        email: { value: "", isEmpty: true, isValid: false },
        skills: { value: "", isEmpty: true },
        major: { value: "", isEmpty: true },
        learn: { value: "", isEmpty: true },
        gender: { value: "", isEmpty: true },
        dietaryRestriction: { value: [], isEmpty: true },
        year: { value: new Date().getFullYear() , isEmpty: false },
        school: { value: "", isEmpty: true },
        resume: {value: "", isEmpty: true, url: null, progress: 0},
        registeredAt: "",
        checkedIn: false,
  })

  const [successRegistration, setSuccessRegistration] = useState(false);

  const handleInputChange = (field: keyof ApplicantForm, value: any, nestedField?: string) => {
    setApplicant( (prevApplicant) => ({
        ...prevApplicant,
        [field] : {
            ...prevApplicant[field],
            ...(nestedField ? { [nestedField] : value } : {value : value} ),
            isEmpty: value === "" || (Array.isArray(value) && value.length === 0),
            },
        }));
  };

  const changeResumeHandle = (event) => {
    const storageReference = storageRef(
      storage,
      `/ideathon-resume-2024/${applicant.year.value}/${event.target.files[0].name}`
    );
    const uploadResumeToDB = uploadBytesResumable(
      storageReference,
      event.target.files[0]
    );

    uploadResumeToDB.on("state_changed", (snapshot) => {
      const progress = ((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      handleInputChange("resume", progress, "progress")
      handleInputChange("resume", uploadResumeToDB, "url")
    });
    handleInputChange("resume",event.target.files[0].name, "value");
    handleInputChange("resume", false, "isEmpty")
  };

  // add multiple dietary restrictions
  const selectRestrictions = (event) => {
    const value = event.target.value;
    const currentRestrictions = Array.isArray(applicant.dietaryRestriction.value) ? applicant.dietaryRestriction.value : [];

    const updatedRestrictions = currentRestrictions.includes(value) ? currentRestrictions.filter((diet) => diet !== value) : [...currentRestrictions, value];

    handleInputChange("dietaryRestriction", updatedRestrictions, "value")
  };

  async function handleSubmit() {
    try {
        let updatedApplicant = { ...applicant };

        if (applicant.resume.url){
            const url = await getDownloadURL(applicant.resume.url.snapshot.ref)
            updatedApplicant = {
                ...updatedApplicant,
                resume : {...updatedApplicant.resume, value: url },
                registeredAt: firebase.firestore.Timestamp.now().toDate().toString(),
            }
        };

        const applicantData = Object.keys(updatedApplicant).reduce((acc,key) => {
            acc[key] = updatedApplicant[key].value;
            return acc
        }, {})

        const newApplicantRef = push(ref(database, 'applicants'));
        await set(newApplicantRef, applicantData)
        setSuccessRegistration(true)
    } catch (error) {
        console.error("Error submitting applicant", error)
        setSuccessRegistration(false)
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
            <Typography>Successfully signed up for Ideathon 23-24!</Typography>
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
                  value={applicant.firstName.value}
                  type="text"
                  size="large"
                  autoComplete="first-name"
                  onChange={(e) => {
                    handleInputChange("firstName",e.target.value.replace(/[^a-z]/gi, "value"));
                    handleInputChange("firstName", false, "isEmpty")
                  }}
                  helperText={
                    applicant.firstName.isEmpty && (
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
                  value={applicant.lastName.value}
                  type="text"
                  autoComplete="last-name"
                  onChange={(e) => {
                    handleInputChange("lastName",e.target.value.replace(/[^a-z]/gi, "value"));
                    handleInputChange("lastName", false, "isEmpty")
                  }}
                  helperText={
                    applicant.lastName.isEmpty && (
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
                value={applicant.email.value}
                type="email"
                autoComplete="email"
                error={!applicant.email.isValid}
                onChange={(e) => {
                  handleInputChange("email",e.target.value, "value");
                  handleInputChange("email", false, "isEmpty")
                  handleInputChange("email", mailformat.test(applicant.email.value as string), " isValid")
                }}
                helperText={
                  (applicant.email.isEmpty && (
                    <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                      Enter your email
                    </Typography>
                  )) ||
                  (!applicant.email.isValid && (
                    <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                      Invalid Email Format
                    </Typography>
                  ))
                }
              />
              <TextField
                fullWidth={true}
                required
                id="major"
                label="Major/Intended Major"
                name="major"
                variant="outlined"
                value={applicant.major.value}
                size="large"
                type="text"
                autoComplete="major"
                onChange={(e) => {
                  handleInputChange("major", e.target.value, "value")
                  handleInputChange("major", false, "isEmpty")
                }}
                helperText={
                  applicant.major.isEmpty && (
                    <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                      Enter your major
                    </Typography>
                  )
                }
              />
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexFlow: "column",
                  gap: "4px",
                }}
              >
                <FormGroup>
                  <InputLabel id="gender">Gender</InputLabel>
                  <RadioGroup
                    name="gender-select"
                    onChange={(e) => {
                      handleInputChange("gender",e.target.value, "value");
                      handleInputChange("gender", e.target.value !== null, "isEmpty");
                    }}
                  >
                    {["Male", "Female", "Other", "Prefer Not to say"].map( (options) => (
                        <FormControlLabel
                            hidden={true}
                            control={<Radio />}
                            key={options}
                            label={options}
                            value={options.toLowerCase()}>
                        </FormControlLabel>
                    ))
                    }
                  </RadioGroup>

                  {applicant.gender.isEmpty ? (
                    <FormHelperText sx={{ color: "red", fontSize: "11px" }}>
                      Please select an option
                    </FormHelperText>
                  ) : null}
                </FormGroup>
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
                    value={applicant.year.value}
                    size="large"
                    onChange={(e) => {
                        handleInputChange("year",e.target.value, "value")
                        handleInputChange("year", false, "isEmpty")
                     }
                    }
                  >
                    {[1,2,3,4].map((offset) => (
                        <MenuItem key={offset} value={applicant.year.value as number + offset}>
                            {applicant.year.value as number + offset}
                        </MenuItem>
                        ))}
                    <MenuItem value={0}>Other</MenuItem>
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
                    value={applicant.school.value}
                    size="large"
                    onChange={(e) => handleInputChange("school",e.target.value,"value")}
                  >
                    {["College", "Engineering", "McIntire", "Architecture", "Wise", "Medicine", "Law", "Darden", "Education", "Professional", "Other"].map( (options) => (
                        <MenuItem key={options} value={options.toLowerCase()}>
                            {options}
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
                  {applicant.resume.progress < 100 ? "Optional - Upload Resume" : applicant.resume.value}
                  <input
                    type="file"
                    size="large"
                    hidden={true}
                    accept="application/msword, application/pdf"
                    onChange={(e) => changeResumeHandle(e)}
                  />
                </Button>
                <LinearProgress variant="determinate" value={applicant.resume.progress} />
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
                  required
                  id="skills"
                  name="skills"
                  variant="outlined"
                  size="large"
                  multiline
                  maxRows={Infinity}
                  value={applicant.skills.value}
                  autoComplete="skills"
                  onChange={(e) => {
                    handleInputChange("skills",e.target.value, "value");
                    handleInputChange("skills", e.target.value !== "", "isEmpty");
                  }}
                  helperText={
                    applicant.skills.isEmpty && (
                      <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                        Enter your skills or N/A
                      </Typography>
                    )
                  }
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
                  multiline
                  maxRows={Infinity}
                  value={applicant.learn.value}
                  autoComplete="learn"
                  onChange={(e) => {
                    handleInputChange("learn",e.target.value,"value");
                    handleInputChange("learn", e.target.value !== "", "isEmpty");
                  }}
                  helperText={
                    applicant.learn.isEmpty && (
                      <Typography sx={{ color: "#f82249", fontSize: "11px" }}>
                        Enter something you would like to learn or N/A
                      </Typography>
                    )
                  }
                />
              </Box>
              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexFlow: "column",
                  gap: "8px",
                }}
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
                </FormGroup>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  flexFlow: "row nowrap",
                  gap: "16px",
                }}
              >
                { Object.values(applicant).every(empty => empty.isEmpty === false) && applicant.email.isValid ?
                (
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
                 ) : (
                  <Popup
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
                          },
                        }}
                        type="submit"
                      >
                        Submit Registration
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
                      <Typography>
                        Please fill out the remaining fields.
                      </Typography>
                    </Box>
                  </Popup>
                )}

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

export default Registration;
