/**
 * Everything about this year's event, in one place. Dates and years used to be
 * hardcoded across the registration forms, the footer and the countdown, which
 * is how the site ended up advertising 2025 with a 2026 graduation list.
 *
 * The countdown also reads `config/eventStart` from the database when it is
 * set, so the date can be moved without a deploy; this is the fallback.
 */
export const EVENT_START = "2026-10-18T10:00:00";

const start = new Date(EVENT_START);

export const EVENT = {
  name: "Ideathon",
  edition: "sixth annual",
  year: start.getFullYear(),
  start,
  // "Sunday, October 18, 2026"
  dateLabel: start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }),
  // "October 18th"
  dayLabel: start.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
  hours: "10:00 AM - 7:00 PM",
  judgingHours: "5:00 PM - 7:00 PM",
  venue: "Rice Hall",
  siteUrl: "https://ideathon.hoohacks.io",
};

// Graduation years offered on the registration form: this year's class through
// four years out, so the list never goes stale.
export const GRADUATION_YEARS = Array.from(
  { length: 5 },
  (_, i) => EVENT.year + i
);

export default EVENT;
