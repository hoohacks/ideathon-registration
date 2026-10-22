/**
 * Closing the final round from the judge page.
 *
 * It is the one button there that ends something for every judge in the room,
 * so it takes two steps: what it does, then typing the phrase. What closing
 * writes is tested in finalRoundService.test.js; this checks the page does not
 * call it until both steps are through.
 */
import { fireEvent, screen } from "@testing-library/react";
import { renderPage } from "../../testing/renderPage";

vi.mock("../../firebase", () => ({
  database: {},
  storage: {},
  auth: { currentUser: { uid: "admin-1", email: "admin@example.com" } },
}));
vi.mock("firebase/database", async () => (await import("../../testing/fakeDatabase")).module);
const db = await import("../../testing/fakeDatabase");

const mockDeactivate = vi.fn();
vi.mock("./finalRoundService", async () => ({
  ...(await vi.importActual("./finalRoundService")),
  deactivateFinalRound: (...a) => mockDeactivate(...a),
}));

const Assignments = (await import("./Assignments")).default;

beforeEach(() => {
  mockDeactivate.mockReset().mockResolvedValue({ ok: true, error: null, snapshotId: "s1" });
  db.reset({
    admins: { "admin-1": true },
    judges: { "admin-1": { firstName: "Olu", lastName: "Admin" } },
    finalRound: { active: true },
  });
});

async function openClose() {
  renderPage(<Assignments />);
  fireEvent.click(await screen.findByRole("button", { name: "Close final round" }));
}

test("the first step says what closing does and closes nothing", async () => {
  await openClose();
  expect(screen.getByText("Close the final round?")).toBeInTheDocument();
  expect(screen.getByText(/Results keeps the final standings/)).toBeInTheDocument();
  expect(mockDeactivate).not.toHaveBeenCalled();
});

test("the second step will not close until the phrase is typed", async () => {
  await openClose();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  const confirm = screen.getByRole("button", { name: "Close final round" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Type "close final round" to confirm'), {
    target: { value: "close" },
  });
  expect(confirm).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Type "close final round" to confirm'), {
    target: { value: "close final round" },
  });
  fireEvent.click(confirm);
  expect(mockDeactivate).toHaveBeenCalledTimes(1);
});

test("cancelling either step closes nothing", async () => {
  await openClose();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  // the page is hidden from the accessibility tree until the dialog has gone
  fireEvent.click(await screen.findByRole("button", { name: "Close final round" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mockDeactivate).not.toHaveBeenCalled();
});

test("a refused close is shown, not swallowed", async () => {
  mockDeactivate.mockResolvedValue({ ok: false, error: "Could not create a restore point, so nothing was changed." });
  await openClose();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText('Type "close final round" to confirm'), {
    target: { value: "close final round" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close final round" }));
  expect(await screen.findByText(/Could not create a restore point/)).toBeInTheDocument();
});
