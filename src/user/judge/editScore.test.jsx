/**
 * A judge correcting a card they already filed.
 *
 * A scored team used to show a dead "Scored" button, so a judge who picked 3
 * meaning 8 could only get it fixed by finding an organizer to re-enter it on
 * paper -- although the rules have always let a judge revise their own card.
 * These check the card offers the edit, opens on what was filed, and writes
 * the change back under the same judge.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderPage } from "../../testing/renderPage";

vi.mock("../../firebase", () => ({ database: {}, storage: {}, auth: { currentUser: { uid: "judge-1" } } }));
vi.mock("firebase/database", async () => (await import("../../testing/fakeDatabase")).module);
vi.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "judge-1" } }) }));
const db = await import("../../testing/fakeDatabase");

const Assignments = (await import("./Assignments")).default;

const assignment = (id, teamName) => ({
  id, teamName, room: "Rice 340", time: "4:30 PM", batch: 1,
  judges: [{ judgeId: "judge-1", judgeName: "Ada Lovelace" }],
});

const filed = {
  problem: 3, innovation: 7, impact: 9, viability: 4, pitch_quality: 4, fundable: true, notes: "Good demo",
  judgeUid: "judge-1", enteredBy: "judge-1", teamId: "t1", teamName: "Rootstock", submittedAt: 1,
};

beforeEach(() => {
  window.localStorage.clear();
  db.reset({
    judges: {
      "judge-1": {
        firstName: "Ada", lastName: "Lovelace", isRound1Judge: true,
        teamAssignments: { t1: assignment("t1", "Rootstock"), t2: assignment("t2", "Kindling") },
      },
    },
    scores: { first: { t1: { "judge-1": filed } } },
  });
});

const judgeAuth = { auth: { userCredential: { user: { uid: "judge-1" } }, userTypes: ["judge"] } };

const cardFor = async (teamName) => {
  let node = await screen.findByRole("heading", { name: teamName });
  while (node && !within(node).queryByRole("button", { name: /score/i })) node = node.parentElement;
  return within(node);
};

test("a scored team offers Edit score, and an unscored one Score team", async () => {
  renderPage(<Assignments />, judgeAuth);
  expect(await (await cardFor("Rootstock")).findByRole("button", { name: "Edit score" })).toBeEnabled();
  expect((await cardFor("Kindling")).getByRole("button", { name: "Score team" })).toBeEnabled();
});

test("editing opens on the card as filed and saves the change under the same judge", async () => {
  renderPage(<Assignments />, judgeAuth);
  fireEvent.click(await (await cardFor("Rootstock")).findByRole("button", { name: "Edit score" }));

  const dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText(/already scored this team/)).toBeInTheDocument();
  expect(dialog.getByRole("combobox", { name: "Problem" })).toHaveTextContent("3");
  expect(dialog.getByRole("combobox", { name: "Impact" })).toHaveTextContent("9");
  expect(dialog.getByLabelText("Notes (optional)")).toHaveValue("Good demo");

  fireEvent.mouseDown(dialog.getByRole("combobox", { name: "Problem" }));
  fireEvent.click(await screen.findByRole("option", { name: "8" }));
  fireEvent.click(dialog.getByRole("button", { name: "Update score" }));

  expect(await screen.findByText("Score updated for Rootstock.")).toBeInTheDocument();
  await waitFor(() => expect(db.getData("scores/first/t1/judge-1")).toMatchObject({
    problem: 8, innovation: 7, impact: 9, viability: 4, pitch_quality: 4, fundable: true, judgeUid: "judge-1",
  }));
});
