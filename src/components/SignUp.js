import React from 'react'

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
  FormHelperText
} from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const SignUp = () => {

  // theme
  const theme = createTheme({
    palette: {
      secondary: {
        main: '#f82249'
      },
      primary: {
        main: '#ff9daf'
      },
      warning: {
        main: '#f82249'
      },
      error: {
        main: '#f82249'
      },
      info: {
        main: '#f82249'
      }
    }
  });

  return (
    <>
      <ThemeProvider theme={theme}>
        <Grid
          container
          spacing={0}
          direction="column"
          alignItems="center"
          justifyContent="center"
          style={{ minHeight: '100vh', minWidth: '100wh' }}
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
                [theme.breakpoints.down('md')]: {
                  margin: "0",
                }
              }}
            >
              <Typography>Sign Up</Typography>
            </Card>
          </Box>
        </Grid>
      </ThemeProvider>
    </>
  )
}

export default SignUp;
