/**
 * The palette, and the one place it deliberately forks.
 *
 * The judge and mentor form shares its shell with the competitor form — same
 * hero, same rail, same cards — so the accent is the only thing telling them
 * apart on sight. If it ever silently converges, the two pages become one page
 * in two sets of words again.
 */
import theme, { judgeTheme, tokens } from "./theme";

test("the judge form does not share the competitor form's accent", () => {
  expect(judgeTheme.palette.primary.main).not.toBe(theme.palette.primary.main);
});

test("the judge accent still holds AA as text on paper", () => {
  // WCAG relative luminance, so a future colour pick cannot quietly fail it
  const luminance = (hex) => {
    const channel = (c) => {
      const v = parseInt(c, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(channel);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const contrast = (1.0 + 0.05) / (luminance(tokens.ACCENT_JUDGE) + 0.05);
  expect(contrast).toBeGreaterThan(4.5);
});

test("everything else is inherited, so the two forms stay siblings", () => {
  expect(judgeTheme.typography.fontFamily).toBe(theme.typography.fontFamily);
  expect(judgeTheme.palette.background.default).toBe(theme.palette.background.default);
  expect(judgeTheme.palette.text.primary).toBe(theme.palette.text.primary);
});
