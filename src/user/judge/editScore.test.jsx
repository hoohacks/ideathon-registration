/**
 * A judge correcting a card they already filed.
 *
 * A scored team used to show a dead "Scored" button, so a judge who picked 3
 * meaning 8 could only get it fixed by finding an organizer to re-enter it on
 * paper -- although the rules have always let a judge revise their own card.
 * These check the card offers the edit, opens on what was filed, and writes
 * the change back under the same judge.
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

describe("the progress line", () => {
  test("counts the final round as well as the first", async () => {
    db.setData("finalRound/active", true);
    db.setData("judges/judge-1/finalAssignments", {
      t1: { teamId: "t1", teamName: "Rootstock", room: "Rice 011", timeslot: "Slot 1" },
    });
    db.setData("scores/first/t2/judge-1", { ...filed, teamId: "t2", teamName: "Kindling" });
    renderPage(<Assignments />, judgeAuth);
    // both first-round cards are in; the final card is not
    expect(await screen.findByText("2 of 3 scored")).toBeInTheDocument();
    expect(screen.queryByText("All teams scored")).not.toBeInTheDocument();
  });

  test("a judge with only final round teams still gets one", async () => {
    db.setData("judges/judge-1/teamAssignments", null);
    db.setData("finalRound/active", true);
    db.setData("judges/judge-1/finalAssignments", {
      t1: { teamId: "t1", teamName: "Rootstock", room: "Rice 011", timeslot: "Slot 1" },
    });
    renderPage(<Assignments />, judgeAuth);
    expect(await screen.findByText("0 of 1 scored")).toBeInTheDocument();
  });
});

describe("a judge with no first round teams", () => {
  beforeEach(() => db.setData("judges/judge-1/teamAssignments", null));
  const says = async (text) => {
    renderPage(<Assignments />, judgeAuth);
    expect(await screen.findByText(text)).toBeInTheDocument();
  };

  test("before any schedule, is told one is coming", () =>
    says("No assignments yet. They appear once an admin generates the schedule."));

  test("left out of a published schedule and checked in, is eligible for the final round", () => {
    db.setData("config/scheduleMeta", { generatedAt: 1 });
    db.setData("judges/judge-1/checkedIn", true);
    return says("No first round teams for you. You're checked in, so you're eligible to judge the final round.");
  });

  test("left out and not checked in, is told checking in makes them eligible", () => {
    db.setData("config/scheduleMeta", { generatedAt: 1 });
    db.setData("judges/judge-1/checkedIn", false);
    return says("No first round teams for you. Check in to be eligible to judge the final round.");
  });

  test("checking in updates the message without a reload", async () => {
    db.setData("config/scheduleMeta", { generatedAt: 1 });
    db.setData("judges/judge-1/checkedIn", false);
    await says("No first round teams for you. Check in to be eligible to judge the final round.");
    act(() => db.setData("judges/judge-1/checkedIn", true));
    expect(await screen.findByText(/You're checked in, so you're eligible/)).toBeInTheDocument();
  });

  test("once the final round is published, promises nothing about it", () => {
    db.setData("config/scheduleMeta", { generatedAt: 1 });
    db.setData("judges/judge-1/checkedIn", true);
    db.setData("finalRound/active", true);
    return says("No first round teams for you.");
  });
});
