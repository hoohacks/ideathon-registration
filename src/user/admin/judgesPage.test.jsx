/**
 * The Judges page against a populated database.
 *
 * Its three toggles each own one flag on the judge record, and the scheduler
 * reads two of them: a wrong write here is a judge silently missing from, or
 * added to, a panel. So each is checked to write exactly its own field.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import JudgeSearch from "./JudgeSearch";
import { renderPage } from "../../testing/renderPage";

vi.mock("../../firebase", () => ({
  database: {},
  storage: {},
  auth: { currentUser: { uid: "admin-1", email: "admin@example.com" } },
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { uid: "admin-1", email: "admin@example.com" } }),
}));
vi.mock("firebase/database", async () => (await import("../../testing/fakeDatabase")).module);
const db = await import("../../testing/fakeDatabase");

const judges = {
  j1: {
    firstName: "Priya", lastName: "Raman", email: "priya@capone.com", company: "Capital One", withCompany: true,
    isRound1Judge: true, checkedIn: true, wantsToMentor: true,
    teamAssignments: { t1: { teamName: "Lantern", time: "5:00 PM", room: "Rice 340", batch: 1 } },
  },
  j2: {
    firstName: "Sam", lastName: "Whitaker", email: "sam@deloitte.com",
    checkedIn: false,
  },
  j3: { firstName: "Noor", lastName: "Haddad", email: "noor@example.com", checkedIn: false },
};

beforeEach(() => db.reset({ admins: { "admin-1": true }, judges }));

// a judge's row: the name's nearest ancestor that also holds the row's buttons
const row = (name) => {
  let node = screen.getByText(name);
  while (node && within(node).queryAllByRole("button").length < 3) node = node.parentElement;
  return within(node);
};
// the filter pills share names with the row toggles, so they are reached
// through their labelled group
const filter = (group, option) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name: option });

test("each judge shows their company and the teams they are seated on", () => {
  renderPage(<JudgeSearch />);
  expect(screen.getByText(/priya@capone.com · Capital One/)).toBeInTheDocument();
  expect(screen.getByText("Lantern (5:00 PM, Rice 340)")).toBeInTheDocument();
  expect(screen.getByText("mentor")).toBeInTheDocument();
});

test("the header counts sign-ups, arrivals and the first-round pool", () => {
  renderPage(<JudgeSearch />);
  const count = (label) => screen.getByText(label).previousSibling.textContent;
  expect(count("signed up")).toBe("3");
  expect(count("checked in")).toBe("1");
  expect(count("first round")).toBe("1");
  expect(screen.queryByText("final round")).not.toBeInTheDocument();
});

test.each([
  ["Mark first round", { isRound1Judge: true }],
  ["Check in", { checkedIn: true }],
])("%s writes only its own flag", async (label, expected) => {
  renderPage(<JudgeSearch />);

  fireEvent.click(row("Noor Haddad").getByRole("button", { name: label }));

  await waitFor(() => expect(db.writes).toContainEqual({ op: "update", path: "judges/j3", value: expected }));
  expect(db.writes).toHaveLength(1);
});

test("a flag that is on turns off, and says it is on while it is", async () => {
  renderPage(<JudgeSearch />);

  const on = row("Priya Raman").getByRole("button", { name: "First round" });
  expect(on).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(on);

  await waitFor(() =>
    expect(db.writes).toContainEqual({ op: "update", path: "judges/j1", value: { isRound1Judge: false } })
  );
});

test("toggling organizer on grants organizer role and shows the chip", async () => {
  renderPage(<JudgeSearch />);

  const button = row("Noor Haddad").getByRole("button", { name: "Make organizer" });
  expect(button).toHaveAttribute("aria-pressed", "false");
  expect(row("Noor Haddad").queryByText("organizer")).not.toBeInTheDocument();

  fireEvent.click(button);

  await waitFor(() => {
    expect(row("Noor Haddad").getByRole("button", { name: "Organizer" })).toHaveAttribute("aria-pressed", "true");
  });
  expect(row("Noor Haddad").getByText("organizer")).toBeInTheDocument();
  expect(db.getData("organizers/j3")).toBe(true);
});

test("toggling organizer off revokes organizer role", async () => {
  db.reset({ admins: { "admin-1": true }, judges, organizers: { j1: true } });
  renderPage(<JudgeSearch />);

  expect(row("Priya Raman").getByText("organizer")).toBeInTheDocument();
  const button = row("Priya Raman").getByRole("button", { name: "Organizer" });
  expect(button).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(button);

  await waitFor(() => {
    expect(row("Priya Raman").getByRole("button", { name: "Make organizer" })).toHaveAttribute("aria-pressed", "false");
  });
  expect(row("Priya Raman").queryByText("organizer")).not.toBeInTheDocument();
  expect(db.getData("organizers/j1")).toBeNull();
});

test("the round filter separates the first-round pool from everyone else", () => {
  renderPage(<JudgeSearch />);

  fireEvent.click(filter("Round", "First round"));
  expect(screen.getByText("Priya Raman")).toBeInTheDocument();
  expect(screen.queryByText("Sam Whitaker")).not.toBeInTheDocument();

  fireEvent.click(filter("Round", "Not first round"));
  expect(screen.getByText("Noor Haddad")).toBeInTheDocument();
  expect(screen.getByText("Sam Whitaker")).toBeInTheDocument();
  expect(screen.queryByText("Priya Raman")).not.toBeInTheDocument();
});

test("the organizer filter separates organizers from other judges", () => {
  db.reset({ admins: { "admin-1": true }, judges, organizers: { j1: true } });
  renderPage(<JudgeSearch />);

  fireEvent.click(filter("Organizer", "Organizer"));
  expect(screen.getByText("Priya Raman")).toBeInTheDocument();
  expect(screen.queryByText("Sam Whitaker")).not.toBeInTheDocument();
  expect(screen.queryByText("Noor Haddad")).not.toBeInTheDocument();

  fireEvent.click(filter("Organizer", "Not organizer"));
  expect(screen.getByText("Sam Whitaker")).toBeInTheDocument();
  expect(screen.getByText("Noor Haddad")).toBeInTheDocument();
  expect(screen.queryByText("Priya Raman")).not.toBeInTheDocument();
});

test("there is no final round mark to set", () => {
  renderPage(<JudgeSearch />);
  expect(row("Noor Haddad").queryByRole("button", { name: "Mark final round" })).not.toBeInTheDocument();
});

test("the check-in filter shows who has not arrived", () => {
  renderPage(<JudgeSearch />);

  fireEvent.click(filter("Check-in", "Not checked in"));
  expect(screen.queryByText("Priya Raman")).not.toBeInTheDocument();
  expect(screen.getByText("Sam Whitaker")).toBeInTheDocument();
  expect(screen.getByText("Noor Haddad")).toBeInTheDocument();
});

test("judges are listed by name", () => {
  renderPage(<JudgeSearch />);
  const names = screen.getAllByText(/^(Noor Haddad|Priya Raman|Sam Whitaker)$/).map((el) => el.textContent);
  expect(names).toEqual(["Noor Haddad", "Priya Raman", "Sam Whitaker"]);
});
