/**
 * The shared destructive-action dialog. `window.confirm` gets dismissed by
 * reflex; this states what will happen and, when a phrase is supplied, keeps
 * the confirm button disabled until the phrase is typed exactly.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./adminUi";

const props = {
  open: true, title: "Publish the schedule?",
  consequences: ["A restore point will be taken.", "Every assignment will be replaced."],
  confirmLabel: "Publish", onConfirm: vi.fn(), onCancel: vi.fn(),
};

test("it lists what will happen", () => {
  render(<ConfirmDialog {...props} />);
  expect(screen.getByText(/Every assignment will be replaced/)).toBeInTheDocument();
});

test("without a phrase, confirming is immediate", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<ConfirmDialog {...props} onConfirm={onConfirm} />);
  await user.click(screen.getByRole("button", { name: "Publish" }));
  expect(onConfirm).toHaveBeenCalled();
});

test("with a phrase, confirming is refused until it matches", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<ConfirmDialog {...props} typeToConfirm="HooHacks Ideathon" onConfirm={onConfirm} />);
  const button = screen.getByRole("button", { name: "Publish" });
  expect(button).toBeDisabled();

  await user.type(screen.getByLabelText(/type/i), "hoohacks ideathon");
  expect(button).toBeDisabled();

  await user.clear(screen.getByLabelText(/type/i));
  await user.type(screen.getByLabelText(/type/i), "HooHacks Ideathon");
  expect(button).toBeEnabled();
  await user.click(button);
  expect(onConfirm).toHaveBeenCalled();
});

test("closing and reopening the dialog resets the typed phrase", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <ConfirmDialog {...props} typeToConfirm="HooHacks Ideathon" onConfirm={vi.fn()} />
  );
  await user.type(screen.getByLabelText(/type/i), "HooHacks Ideathon");
  expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  // leave the field first: user-event fires its change-on-blur when focus
  // moves, and closing would otherwise move it in the middle of a render
  await user.tab();

  rerender(
    <ConfirmDialog {...props} open={false} typeToConfirm="HooHacks Ideathon" onConfirm={vi.fn()} />
  );
  rerender(
    <ConfirmDialog {...props} open typeToConfirm="HooHacks Ideathon" onConfirm={vi.fn()} />
  );

  expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  expect(screen.getByLabelText(/type/i)).toHaveValue("");
});
