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
// import more styling
import { theme, popupStyles, gridStyles } from "./styles/registrationStyles.tsx"
// import configs
import configs from "./configs/textFieldConfig.tsx"
// import components
import RegistrationStatusModal from './components/RegistrationStatusModal.tsx';
import IdeathonLogo from './components/IdeathonLogo.tsx';


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
    setApplicant( (prevApplicant: ApplicantForm) => ({
        ...prevApplicant,
        [field] : {
            ...prevApplicant[field] as (FormField | EmailField | ResumeField),
            ...(nestedField ? { [nestedField] : value } : {value : value} ),
            isEmpty: value === "" || (Array.isArray(value) && value.length === 0),
            },
        }));
  };

  const changeResumeHandle = (event: any) => {
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
  const selectRestrictions = (event : any) => {
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

        const applicantData = Object.keys(updatedApplicant).reduce((acc: Record<string, any>, key) => {
            const field = updatedApplicant[key as keyof ApplicantForm] as FormField | EmailField | ResumeField;
            acc[key] = field.value;
            return acc;
        }, {});

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
      <RegistrationStatusModal
        isOpen={successRegistration}
        onClose={() => setSuccessRegistration(false)}
      />
        <Grid
          container
          sx={gridStyles.main}
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

              <Box sx={gridStyles.box2} >
                <TextField
                  {... configs.firstNameConfig}
                  value={applicant.firstName.value}
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
                  {... configs.lastNameConfig}
                  value={applicant.lastName.value}
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
                {...configs.emailConfig}
                value={applicant.email.value}
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
                {...configs.majorConfig}
                value={applicant.major.value}
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
              <Box sx={gridStyles.box3} >
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
              <Box sx={gridStyles.box4}>
                <FormControl size="small">
                  <InputLabel>Expected Graduation Date</InputLabel>
                  <Select
                    {...configs.yearLabelConfig}
                    value={applicant.year.value}
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
              <Box sx={gridStyles.box5} >
                <FormControl size="small">
                  <InputLabel id="school-select">
                    University of Virginia School
                  </InputLabel>
                  <Select
                    {...configs.schoolSelectConfig}
                    value={applicant.school.value}
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
              <Box sx={gridStyles.box5}>
                <Button
                  variant="contained"
                  component="label"
                  sx={gridStyles.button}
                >
                  {applicant.resume.progress < 100 ? "Optional - Upload Resume" : applicant.resume.value}
                  <input
                    type="file"
                    size={100}
                    hidden={true}
                    accept="application/msword, application/pdf"
                    onChange={(e) => changeResumeHandle(e)}
                  />
                </Button>
                <LinearProgress variant="determinate" value={applicant.resume.progress} />
              </Box>
              <Box sx={gridStyles.box6}>
                <Typography id="skills">
                  What are some skills that you possess that you think would be
                  helpful for Ideathon participants? This will be used primarily
                  for team building. *
                </Typography>
                <TextField
                  {...configs.skillsConfig}
                  value={applicant.skills.value}
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
              <Box sx={gridStyles.box6}>
                <Typography id="learn">
                  What would you like to learn or get out of the Ideathon? *
                </Typography>
                <TextField
                  {...configs.learnConfig}
                  value={applicant.learn.value}
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
              <Box sx={gridStyles.box6}>
                <FormGroup>
                  <InputLabel id="dietary-restriction">
                    Dietary Restrictions
                  </InputLabel>

                  { [{label: "Vegetarian", value: "vegetarian" }, {label: "Gluten Free", value: "gluten-free"}, {label: "Vegan", value: "vegan"}, {label: "Other", value: "other"}].map( (options) => (
                    <FormControlLabel
                        hidden={true}
                        control={<Checkbox onChange={selectRestrictions} />}
                        key = {options.value}
                        label = {options.label}
                        value={options.value}
                    />
                  ))}
                </FormGroup>
              </Box>
              <Box sx={gridStyles.box7} >
                { Object.values(applicant).every(empty => empty.isEmpty === false) && applicant.email.isValid ?
                (
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
                      <Button sx={gridStyles.button2} type="submit">
                        Submit Registration
                      </Button>
                    }
                    on="hover"
                    position="top center"
                  >
                    <Box sx={gridStyles.popupBox}>
                      <Typography>
                        Please fill out the remaining fields.
                      </Typography>
                    </Box>
                  </Popup>
                )}

                <Link href="https://ideathon.hoohacks.io">
                  <Button sx={gridStyles.button3} type="button">
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
