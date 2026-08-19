import { createTheme } from "@mui/material/styles";

/**
 * One theme for the whole app. Login, ForgotPassword and both registration
 * forms each used to build their own near-identical copy, which is why type
 * sizes and button styles drifted between pages.
 *
 * Deliberately restrained: a single accent colour, flat surfaces with hairline
 * borders instead of drop shadows, and no transforms on hover. Motion and
 * layered shadows are what make an interface look busy rather than considered.
 */
const ACCENT = "#d81b45";
const INK = "#14171f";
const MUTED = "#5b6472";
const LINE = "#e3e6eb";
const SURFACE = "#ffffff";
const CANVAS = "#f7f8fa";

const theme = createTheme({
  palette: {
    primary: { main: ACCENT, contrastText: "#fff" },
    secondary: { main: INK, contrastText: "#fff" },
    error: { main: "#c0392b" },
    warning: { main: "#b45309" },
    success: { main: "#15803d" },
    background: { default: CANVAS, paper: SURFACE },
    text: { primary: INK, secondary: MUTED },
    divider: LINE,
  },

  shape: { borderRadius: 8 },

  typography: {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    // The old pages used 48px inline headings. This scale keeps hierarchy
    // without shouting.
    h1: { fontSize: "1.875rem", fontWeight: 650, letterSpacing: "-0.02em" },
    h2: { fontSize: "1.5rem", fontWeight: 650, letterSpacing: "-0.015em" },
    h3: { fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.01em" },
    h4: { fontSize: "1.125rem", fontWeight: 600 },
    h5: { fontSize: "1rem", fontWeight: 600 },
    h6: { fontSize: "0.9375rem", fontWeight: 600 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.55 },
    body2: { fontSize: "0.875rem", lineHeight: 1.5, color: MUTED },
    button: { textTransform: "none", fontWeight: 550, letterSpacing: 0 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: CANVAS, color: INK },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { paddingInline: 16, minHeight: 38 },
        // colour change only -- no scaling, no shadow bloom
        containedPrimary: { "&:hover": { backgroundColor: "#b81438" } },
        outlined: { borderColor: LINE, color: INK, "&:hover": { borderColor: "#c8ccd4", backgroundColor: CANVAS } },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: { borderColor: LINE },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0, variant: "outlined" },
      styleOverrides: { root: { borderColor: LINE } },
    },
    MuiTextField: {
      // Labels sit above the field rather than floating into it. Besides
      // reading more cleanly, it sidesteps Chrome autofilling a value before
      // React sees a change event, which left the label sitting on top of it.
      defaultProps: { size: "small", InputLabelProps: { shrink: true } },
    },
    MuiSelect: { defaultProps: { size: "small" } },
    MuiFormControl: { defaultProps: { size: "small" } },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: LINE },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "inherit" },
      styleOverrides: {
        root: {
          backgroundColor: SURFACE,
          borderBottom: `1px solid ${LINE}`,
          color: INK,
        },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2 } } },
    MuiLink: { defaultProps: { underline: "hover" } },
  },
});

export const tokens = { ACCENT, INK, MUTED, LINE, SURFACE, CANVAS };
export default theme;
