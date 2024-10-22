const configs = {
    firstNameConfig: {
        fullWidth: true,
        required: true,
        id: "first-name",
        name: "first-name",
        label: "First Name",
        variant: "outlined" as "outlined",
        type: "text",
        size: "large",
        autoComplete: "first-name"
    },

    lastNameConfig: {
        fullWidth: true,
        required: true,
        id: "last-name",
        name: "last-name",
        variant: "outlined" as "outlined",
        label: "Last Name",
        size: "large",
        type: "text",
        autoComplete: "last-name",
    },

    emailConfig: {
        fullWidth: true,
        required: true,
        id: "Email",
        label: "Email Address",
        name: "Email",
        variant: "outlined",
        size: "large",
        type: "email",
        autoComplete: "email",
    },

    majorConfig: {
        fullWidth: true,
        required: true,
        id: "major",
        label: "Major/Intended Major",
        name: "major",
        variant: "outlined",
        size: "large",
        type: "text",
        autoComplete: "major",
    },

    schoolLabelConfig: {
        labelId: "school-year-select",
        label: "Expected Graduation Year",
        size: "large",
    },

    yearLabelConfig: {
        id:"other-year",
        label:"Other Expected Graduation Year",
        name:"other-year",
        variant:"outlined",
        size:"large",
        type:"text",
        autoComplete:"selectYear"
    },

    schoolSelectConfig: {
        labelId: "school-select",
        label: "University of Virginia School",
        size: "large",
    },

    applicationConfig: {
        type: "file",
        size: "large",
        accept: "application/msword, application/pdf",
    },

    skillsConfig: {
        required: true,
        id: "skills",
        name: "skills",
        variant: "outlined",
        size: "large",
        multiline: true,
        maxRows: {Infinity},
        autoComplete: "skills",
    },

    learnConfig: {
        required: true,
        id: "learn",
        name: "learn",
        variant: "outlined",
        size: "large",
        multiline: true,
        maxRows: {Infinity},
        autoComplete: "learn",
    },

    dietConfig: {
        id: "dietary-specify-other",
        name: "dietary-specify-other",
        variant: "outlined",
        size: "large",
        type: "text",
        autoComplete: "dietary-specify-other",
    }
}


export default configs
