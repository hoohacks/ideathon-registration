/**
 * The results page on the night.
 *
 * The arithmetic is in standings.test.js. These check what the page claims
 * from it: a leader while cards are due and a winner once they are in, a judge
 * who stepped out not holding the result up, a tie shown as a tie, and the
 * result staying on screen after the round is closed.
 */
import { act, screen } from "@testing-library/react";
import Results from "./Results";
import { renderPage } from "../../../testing/renderPage";

vi.mock("../../../firebase", () => ({
  database: {},
  storage: {},
  auth: { currentUser: { uid: "admin-1", email: "admin@example.com" } },
}));
vi.mock("firebase/database", async () => (await import("../../../testing/fakeDatabase")).module);
const db = await import("../../../testing/fakeDatabase");

// worth 4n of 40
const card = (n) => ({ problem: n, innovation: n, impact: n, viability: n / 2, pitch_quality: n / 2 });
const seat = { a: {}, b: {} };

beforeEach(() => {
  db.reset({
    judges: {
      j1: { firstName: "Priya", lastName: "Raman", finalAssignments: seat },
      j2: { firstName: "Sam", lastName: "Whitaker", finalAssignments: seat },
      j3: { firstName: "Noor", lastName: "Haddad", finalAssignments: seat },
    },
    finalRound: {
      active: true,
      teams: {
        a: { name: "Almanac", averageScore: 30, panel: { j1: true, j2: true, j3: true } },
        b: { name: "Beacon", averageScore: 28, panel: { j1: true, j2: true, j3: true } },
      },
    },
    scores: { final: {} },
  });
});

const show = () => renderPage(<Results />, { route: "/results" });

test("a team on top while cards are due is leading, not the winner", () => {
  db.setData("scores/final", { a: { j1: card(9), j2: card(9) }, b: { j1: card(7) } });
  show();
  expect(screen.getByText("Leading")).toBeInTheDocument();
  expect(screen.queryByText("Winner")).not.toBeInTheDocument();
  expect(screen.getByText(/Sam Whitaker has scored 1 of 2 finalists and still owes Beacon\./)).toBeInTheDocument();
});

test("a judge who never scored anybody does not hold the winner up, and is named", () => {
  db.setData("scores/final", {
    a: { j1: card(9), j2: card(9) },
    b: { j1: card(7), j2: card(7) },
  });
  show();
  expect(screen.getByText("Winner")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Almanac" })).toBeInTheDocument();
  expect(screen.getByText(/Not counted: Noor Haddad, who has not scored any finalist\./)).toBeInTheDocument();
});

test("a tie for first names both teams and leaves it to organizers", () => {
  db.setData("scores/final", {
    a: { j1: card(8), j2: card(8) },
    b: { j1: card(8), j2: { ...card(8), fundable: true } },
  });
  show();
  expect(screen.getByText("Tied for first")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Almanac and Beacon" })).toBeInTheDocument();
  expect(screen.getByText(/Organizers decide the order\./)).toBeInTheDocument();
  expect(screen.getAllByLabelText("tied for place 1")).toHaveLength(2);
});

test("closing the round keeps the result on screen and makes it final", () => {
  db.setData("scores/final", { a: { j1: card(9), j2: card(9) }, b: { j1: card(7) } });
  show();
  expect(screen.getByText("Leading")).toBeInTheDocument();

  // what closing does: assignments withdrawn, the flag off, the standings kept
  act(() => {
    for (const judge of ["j1", "j2", "j3"]) db.setData(`judges/${judge}/finalAssignments`, null);
    db.setData("finalRound/active", false);
  });

  expect(screen.getByText("Winner")).toBeInTheDocument();
  expect(screen.getByText(/across 2 judges\. The final round is closed\./)).toBeInTheDocument();
  expect(screen.getByText(/Sam Whitaker scored 1 of 2 finalists/)).toBeInTheDocument();
});

test("before anyone scores there is no leader", () => {
  show();
  expect(screen.getByText("No final round scores have been filed yet.")).toBeInTheDocument();
  expect(screen.queryByText("Leading")).not.toBeInTheDocument();
});

test("a finalist's slot reads as the clock time once the final round has one", () => {
  db.setData("finalRound/teams/b/timeslot", "Slot 2");
  db.setData("config", { finalRoundTime: "6:00 PM", finalRoundSlotMinutes: 8 });
  db.setData("scores/final", { a: { j1: card(9) }, b: { j1: card(7) } });
  show();
  expect(screen.getByText(/· 6:08 PM ·/)).toBeInTheDocument();
  expect(screen.queryByText(/Slot 2/)).not.toBeInTheDocument();
});
