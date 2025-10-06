import React, { useState } from "react";
import {useAuth} from "./App.js";
import { useNavigate } from "react-router-dom";
import {
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Link,
  Grid,
  Box,
  Typography,
  Container,
  CssBaseline,
} from "@mui/material";

import { ThemeProvider, createTheme } from "@mui/material/styles";

export default function LoginPage() {
    const { handleLogin } = useAuth();
    const navigate = useNavigate();
    const [showErrorMessage, setShowErrorMessage] = useState("");

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

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    remember: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await handleLogin(formData.email, formData.password);
    console.log("here");
    if(success) {
        navigate("/user/home")
    }
    else {
        setShowErrorMessage(true);
    }
    console.log("Form submitted:", formData);
  };

  return (
    <ThemeProvider theme ={theme}>
            <Container component="main" maxWidth="xs">
      <CssBaseline />
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography component="h1" variant="h5">
          Sign In
        </Typography>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={formData.email}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={formData.password}
            onChange={handleChange}
          />
          <FormControlLabel
            control={
              <Checkbox
                name="remember"
                checked={formData.remember}
                onChange={handleChange}
                color="primary"
              />
            }
            label="Remember me"
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Sign In
          </Button>
          <Grid container>
            <Grid item xs>
              <Link href="#" variant="body2">
                Forgot password?
              </Link>
            </Grid>
            <Grid item>
              <Link href="#/ideathon-registration" variant="body2">
                {"Don't have an account? Sign Up"}
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Box>
      {showErrorMessage ? <Typography sx={{ mt: 3 }} color="error" component="p">Error logging in, please try again or consider resetting your password.</Typography> : 
    null}
    </Container>
    </ThemeProvider>
  );
}

