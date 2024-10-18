import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
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

export const popupStyles = {
    box: {
        borderRadius: "5px",
        textAlign: "center",
        padding: "15px",
        display: "flex",
        flexFlow: "column",
        gap: "8px",
      },
    button: {
        backgroundColor: "#f82249",
        color: "#fff",
        boxShadow: 2,
        "&:hover": {
            transform: "scale3d(1.05, 1.05, 1)",
            backgroundColor: "#fff",
            color: "#f82249",
            border: "1px solid",
            borderColor: "#f82249"
        }
    },
}

export const gridStyles = {
    main: {
        minHeight: "100vh", 
        minWidth: "100wh",
        spacing: 0,
        direction: "column",
        alignItems: "center",
        justifyContent: "center"
    },

    box: {
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        marginLeft: "auto",
        marginRight: "auto",
        display: "flex",
    },

    card: {
        boxShadow: "none",
        display: "flex",
        flexFlow: "column nowrap",
        margin: "24px",
        width: "582px",
        alignItems: "center",
        backgroundColor: "#fff",
        padding: "22px 22px",
        gap: "16px",
        border: "none",
    },

    image: {
        borderRadius: "5px",
        width: "582px",
        objectFit: "cover",
    },

    box2: {
        width: "100%",
        display: "flex",
        flexFlow: "row nowrap",
        justifyContent: "center",
        gap: "8px",
    },

    box3: {
        width: "100%",
        display: "flex",
        flexFlow: "column",
        gap: "4px",
    },
    box4: {
        width: "100%",
        display: "flex",
        flexFlow: "column nowrap",
        gap: "8px",
    },
    
    box5: {
        width: "100%",
        display: "flex",
        flexFlow: "column nowrap",
        gap: "4px",
    },

    box6: {
        width: "100%",
        display: "flex",
        flexFlow: "column",
        gap: "8px",
        boxSizing: "border-box",
    },

    box7: {
        display: "flex",
        flexFlow: "row nowrap",
        gap: "16px",
    },

    popupBox: {
        padding: "5px",
        textAlign: "center",
        display: "flex",
        flexFlow: "column nowrap",
    },

    button: {
        backgroundColor: "#f82249",
        color: "#fff",
        "&:hover": {
            backgroundColor: "#fff",
            color: "#f82249",
            border: "1px solid",
            borderColor: "#f82249",
        }
    },

    button2: {
        backgroundColor: "#f82249",
        color: "#fff",
        boxShadow: 2,
        "&:hover": {
            transform: "scale3d(1.05, 1.05, 1)",
            backgroundColor: "#fff",
            color: "#f82249",
            border: "1px solid",
            borderColor: "#f82249",
        }
    },

    button3: {
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
    }
}