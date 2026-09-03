import { createTheme } from "@mui/material/styles";

/**
 * One theme for the whole app.
 *
 * This is an operations tool before it is anything else. Two of its thirty
 * screens are public sign-up forms; the rest are people running a live event
 * against a clock -- building a judging schedule, watching which team has no
 * scores with forty minutes left, deciding who is in the final round. It is
 * designed for that: legible under pressure, dense where density helps, and
 * quiet everywhere else.
 *
 * Three rules hold it together.
 *
 * **Colour is reserved for state.** The interface itself is neutral: buttons,
 * controls and chrome are ink. Crimson -- the brand, sampled from the logo --
 * appears only where something is genuinely live, and red only where something
 * is genuinely wrong. Crimson used to be the primary action colour, which put
 * "Publish schedule" in the same register as "3 teams have no scores at all" on
 * a page whose entire job is telling you which is which.
 *
 * **The numbers are the content.** Times, rooms, slots, scores, batches and
 * counts are set in IBM Plex Mono with tabular figures, so a schedule grid or a
 * progress list scans like a departure board rather than a paragraph. Use the
 * `data` typography variant for anything an organizer reads off the screen and
 * acts on.
 *
 * **Hierarchy comes from weight and size, not from a second voice.** One family
 * for everything spoken. The old pairing put a signage face on the headings,
 * which reads as a poster for the event rather than the tool that runs it.
 *
 * The chrome is dark because the logo decides it: ideathon-logo.png is two inks
 * on transparency, crimson and white, and the white half is half the wordmark.
 * There is no light surface it can sit on.
 */

// Brand. Sampled from the logo: every crimson pixel in it is exactly this.
// Reserved for the wordmark and for live state -- never for ordinary actions.
const BRAND = "#d62749";
const BRAND_DARK = "#b41f3c";
const BRAND_WASH = "#fdf0f3";

// The interface itself.
const INK = "#14171f";
const INK_HOVER = "#000208";
const MUTED = "#5b6472";
const LINE = "#e3e6eb";
const LINE_STRONG = "#c8ccd4";
const SURFACE = "#ffffff";
const CANVAS = "#f7f8fa";

// State. Deliberately not the brand crimson: an alert and a brand mark that
// look alike is the problem this palette exists to fix. Same red family, so it
// still reads as an error without being taught -- but 2.5x darker than the
// brand, which is what actually separates them on screen. A first pass used
// #b3261e and it was only 15 degrees of hue and 9% lightness away: close
// enough that an alert beside the wordmark read as more branding.
const DANGER = "#8c1d18";
const CAUTION = "#a15c07";
const GOOD = "#146c43";

// Chrome. A blue-black rather than a grey-black -- it comes off the original
// event artwork, and it is what makes the crimson read warm rather than pink.
const NIGHT = "#0c0a20";
const NIGHT_RAISED = "#1b1840";
const NIGHT_LINE = "#2e2a55";
const ON_NIGHT = "#edecf5";
const ON_NIGHT_MUTED = "#9c98bd";

const BODY =
  '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// kept so anything that referenced the old roles still resolves
const DISPLAY = BODY;
const ACCENT = BRAND;
const ACCENT_DARK = BRAND_DARK;
const ACCENT_WASH = BRAND_WASH;

const theme = createTheme({
  palette: {
    // Actions are neutral. See "colour is reserved for state" above.
    primary: { main: INK, dark: INK_HOVER, contrastText: "#fff" },
    secondary: { main: BRAND, dark: BRAND_DARK, contrastText: "#fff" },
    error: { main: DANGER },
    warning: { main: CAUTION },
    success: { main: GOOD },
    info: { main: INK },
    background: { default: CANVAS, paper: SURFACE },
    text: { primary: INK, secondary: MUTED },
    divider: LINE,
  },

  shape: { borderRadius: 6 },

  typography: {
    fontFamily: BODY,

    // Page and section titles. One family, so the steps are weight and size.
    h1: { fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.021em", lineHeight: 1.2 },
    h2: { fontSize: "1.375rem", fontWeight: 600, letterSpacing: "-0.016em", lineHeight: 1.25 },
    h3: { fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.008em" },
    h4: { fontSize: "0.9375rem", fontWeight: 600 },
    h5: { fontSize: "0.9375rem", fontWeight: 600 },
    h6: { fontSize: "0.875rem", fontWeight: 600 },

    body1: { fontSize: "0.9375rem", lineHeight: 1.55 },
    body2: { fontSize: "0.875rem", lineHeight: 1.5, color: MUTED },
    caption: { fontSize: "0.8125rem", lineHeight: 1.45, color: MUTED },
    button: { textTransform: "none", fontWeight: 500, letterSpacing: 0, fontSize: "0.875rem" },

    // Structural label above a section or a stat.
    overline: {
      fontSize: "0.6875rem",
      fontWeight: 600,
      letterSpacing: "0.07em",
      textTransform: "uppercase",
      lineHeight: 1.6,
      color: MUTED,
    },

    /**
     * Operational data: a time, a room, a slot, a score, a count.
     *
     * Mono with tabular figures so a column of them lines up and a changed
     * digit does not shift the ones beside it. `<Typography variant="data">`,
     * or `theme.typography.data` spread into an sx.
     */
    data: {
      fontFamily: MONO,
      fontSize: "0.8125rem",
      fontWeight: 500,
      letterSpacing: "-0.01em",
      fontVariantNumeric: "tabular-nums",
      fontFeatureSettings: '"tnum" 1',
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: CANVAS, color: INK },
        // Every interactive element gets the same ring. Browsers disagree on
        // the default and MUI removes several of them.
        ":focus-visible": { outline: `2px solid ${INK}`, outlineOffset: 2 },
      },
    },

    MuiTypography: {
      defaultProps: { variantMapping: { data: "span" } },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { paddingInline: 14, minHeight: 36, borderRadius: 6 },
        // colour change only -- no scaling, no shadow bloom
        containedPrimary: { "&:hover": { backgroundColor: INK_HOVER } },
        outlined: {
          borderColor: LINE_STRONG,
          color: INK,
          "&:hover": { borderColor: INK, backgroundColor: CANVAS },
        },
        text: { "&:hover": { backgroundColor: CANVAS } },
        sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: "0.8125rem" },
        sizeLarge: { minHeight: 44, fontSize: "0.9375rem" },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: "none" }, outlined: { borderColor: LINE } },
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
    MuiInputLabel: {
      defaultProps: { shrink: true },
      styleOverrides: { root: { fontWeight: 500, color: MUTED } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: { borderColor: LINE_STRONG },
        root: {
          backgroundColor: SURFACE,
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: MUTED },
        },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2 } } },

    MuiAppBar: {
      defaultProps: { elevation: 0, color: "inherit" },
      styleOverrides: { root: { backgroundColor: NIGHT, color: ON_NIGHT } },
    },

    MuiLink: { defaultProps: { underline: "hover" }, styleOverrides: { root: { color: INK } } },

    MuiDialog: {
      defaultProps: { maxWidth: "xs", fullWidth: true },
      styleOverrides: { paper: { border: `1px solid ${LINE}`, borderRadius: 8 } },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontSize: "1.0625rem", fontWeight: 600, letterSpacing: "-0.008em" },
      },
    },

    MuiAlert: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: { alignItems: "center", borderRadius: 6 },
        message: { fontSize: "0.875rem" },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500 },
        outlined: { borderColor: LINE_STRONG },
        sizeSmall: { height: 22, fontSize: "0.75rem" },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 500, minHeight: 42, fontSize: "0.875rem" },
      },
    },
    MuiTabs: { styleOverrides: { root: { minHeight: 42 } } },

    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: LINE, fontSize: "0.875rem" },
        head: { fontWeight: 600, color: MUTED, fontSize: "0.8125rem" },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: INK, fontSize: "0.75rem", fontWeight: 400, padding: "6px 8px" },
      },
    },
  },
});

/**
 * The judge and mentor form once carried its own accent, to tell it apart from
 * the competitor form at a glance. Under a palette where colour means state,
 * a second brand colour for one form is exactly the kind of decoration this
 * theme removes -- so the two forms are now told apart by their titles and
 * their content, and this is the same theme.
 *
 * Kept as an export so the form does not have to change shape to lose it.
 */
export const judgeTheme = theme;

export const tokens = {
  BRAND,
  BRAND_DARK,
  BRAND_WASH,
  DANGER,
  CAUTION,
  GOOD,
  INK,
  INK_HOVER,
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
  BODY,
  MONO,
  // previous names, so anything that referenced them still resolves
  ACCENT,
  ACCENT_DARK,
  ACCENT_WASH,
  DISPLAY,
};

export default theme;
