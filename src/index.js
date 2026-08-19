import React from "react";
import ReactDOM from "react-dom/client";
import reportWebVitals from "./reportWebVitals";
import { HashRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import App from "./App";
import theme from "./theme";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

// one ThemeProvider for the whole app, so pages stop defining their own
root.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <HashRouter>
      <App />
    </HashRouter>
  </ThemeProvider>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
