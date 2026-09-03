import { createTheme } from "@mui/material/styles";

/**
 * One theme for the whole app. Login, ForgotPassword and both registration
 * forms each used to build their own near-identical copy, which is why type
 * sizes and button styles drifted between pages.
 *
 * Deliberately restrained: a single accent colour, flat surfaces with hairline
 * borders instead of drop shadows, and no transforms on hover. Motion and
 * layered shadows are what make an interface look busy rather than considered.
 *
 * The one place it is not quiet is the headings. Archivo is a grotesque with
 * the squared-off, slightly compressed feel of event signage -- the right voice
 * for a day where people are finding a room in Rice Hall and reading their name
 * off a badge. It carries h1 and h2 only; everything a person actually has to
 * read or fill in is Inter.
 *
 * The chrome is dark because the logo decides it: ideathon-logo.png is two inks
 * on transparency, crimson and white, and the white half is half the wordmark.
 * There is no light surface it can sit on. So the nav, the drawer and the
 * scanner are night, the working surfaces stay paper, and the accent is taken
 * from the logo itself rather than guessed at.
 */

// sampled from the logo: every crimson pixel in it is exactly this
const ACCENT = "#d62749";
const ACCENT_DARK = "#b41f3c";
const ACCENT_WASH = "#fdf0f3";
const INK = "#14171f";
const MUTED = "#5b6472";
const LINE = "#e3e6eb";
const LINE_STRONG = "#c8ccd4";
const SURFACE = "#ffffff";
const CANVAS = "#f7f8fa";

// The judge and mentor form shares its shell with the competitor form, so at a
// glance the two were the same page in two sets of words. This is the one thing
// that tells them apart on sight. It is pulled out of the night chrome below
// rather than invented, so it belongs to the same palette as everything else,
// and lightened until it holds its own as text on paper.
const ACCENT_JUDGE = "#4a3bbf";
const ACCENT_JUDGE_DARK = "#3a2e9c";

// Chrome. A blue-black rather than a grey-black -- it comes off the original
// event artwork, and it is what makes the crimson read warm rather than pink.
const NIGHT = "#0c0a20";
const NIGHT_RAISED = "#1b1840";
const NIGHT_LINE = "#2e2a55";
const ON_NIGHT = "#edecf5";
const ON_NIGHT_MUTED = "#9c98bd";

const DISPLAY = '"Archivo", "Inter", "Segoe UI", Helvetica, Arial, sans-serif';
const BODY =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const theme = createTheme({
  palette: {
    primary: { main: ACCENT, dark: ACCENT_DARK, contrastText: "#fff" },
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
    fontFamily: BODY,
    // The old pages used 48px inline headings. This scale keeps hierarchy
    // without shouting.
    h1: {
      fontFamily: DISPLAY,
      fontSize: "1.875rem",
      fontWeight: 700,
      letterSpacing: "-0.022em",
      lineHeight: 1.15,
    },
    h2: {
      fontFamily: DISPLAY,
      fontSize: "1.5rem",
      fontWeight: 700,
      letterSpacing: "-0.018em",
      lineHeight: 1.2,
    },
    h3: { fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.01em" },
    h4: { fontSize: "1.125rem", fontWeight: 600 },
    h5: { fontSize: "1rem", fontWeight: 600 },
    h6: { fontSize: "0.9375rem", fontWeight: 600 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.55 },
    body2: { fontSize: "0.875rem", lineHeight: 1.5, color: MUTED },
    button: { textTransform: "none", fontWeight: 550, letterSpacing: 0 },
    // Small caps-ish label used to head a section or a stat. Section headings
    // are structure, so they get their own role rather than a one-off sx.
    overline: {
      fontSize: "0.6875rem",
      fontWeight: 600,
      letterSpacing: "0.09em",
      textTransform: "uppercase",
      lineHeight: 1.6,
      color: MUTED,
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: CANVAS, color: INK },
        // Every interactive element gets the same ring. Browsers disagree on
        // the default and MUI removes several of them.
        ":focus-visible": {
          outline: `2px solid ${ACCENT}`,
          outlineOffset: 2,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { paddingInline: 16, minHeight: 38 },
        // colour change only -- no scaling, no shadow bloom
        containedPrimary: { "&:hover": { backgroundColor: ACCENT_DARK } },
        outlined: {
          borderColor: LINE,
          color: INK,
          "&:hover": { borderColor: LINE_STRONG, backgroundColor: CANVAS },
        },
        sizeLarge: { minHeight: 46, fontSize: "0.9375rem" },
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
    MuiInputLabel: { defaultProps: { shrink: true } },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: LINE },
        root: {
          backgroundColor: SURFACE,
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: LINE_STRONG },
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "inherit" },
      styleOverrides: {
        root: { backgroundColor: NIGHT, color: ON_NIGHT },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2 } } },
    MuiLink: { defaultProps: { underline: "hover" } },
    MuiDialog: {
      defaultProps: { maxWidth: "xs", fullWidth: true },
      styleOverrides: { paper: { border: `1px solid ${LINE}` } },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontFamily: DISPLAY, fontSize: "1.25rem", fontWeight: 700 } },
    },
    MuiAlert: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { alignItems: "center" } },
    },
    MuiChip: { styleOverrides: { outlined: { borderColor: LINE } } },
  },
});

/**
 * The same theme with the accent swapped, for the judge and mentor form.
 *
 * A nested ThemeProvider rather than an `accent` prop threaded through
 * registrationUi: the progress meter, the rail's counters, the submit button
 * and every focus ring already read `primary.main`, so overriding one palette
 * entry recolours all of them at once and none of the shared components has to
 * learn about a second brand.
 */
export const judgeTheme = createTheme(theme, {
  palette: {
    primary: { main: ACCENT_JUDGE, dark: ACCENT_JUDGE_DARK, contrastText: "#fff" },
  },
});

export const tokens = {
  ACCENT,
  ACCENT_JUDGE,
  ACCENT_DARK,
  ACCENT_WASH,
  INK,
  MUTED,
  LINE,
  LINE_STRONG,
  SURFACE,
  CANVAS,
  NIGHT,
  NIGHT_RAISED,
  NIGHT_LINE,
  ON_NIGHT,
  ON_NIGHT_MUTED,
  DISPLAY,
  BODY,
};
export default theme;
