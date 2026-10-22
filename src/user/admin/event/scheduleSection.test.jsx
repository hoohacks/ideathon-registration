import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The judges-per-team row. A blank max is how an organizer says "no cap", so it
 * has to reach the setter as null rather than as 0 or an empty string.
 */
const mock = vi.hoisted(() => ({
  setJudgesPerTeam: vi.fn(async () => ({ ok: true })),
  setFinalRoundTime: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./eventConfig", () => ({
  setBatchCount: vi.fn(),
  setBatchTimes: vi.fn(),
  setFinalRoundRoom: vi.fn(),
  setFinalRoundTime: mock.setFinalRoundTime,
  setJudgesPerTeam: mock.setJudgesPerTeam,
}));

const { default: ScheduleSection } = await import("./ScheduleSection");

const min = () => screen.getByLabelText("Min judges per team");
const max = () => screen.getByLabelText("Max judges per team");
// Batches, then this row, then the final round room; "Save times" is its own name
const save = () => screen.getAllByRole("button", { name: "Save" })[1];

beforeEach(() => {
  mock.setJudgesPerTeam.mockClear();
  mock.setFinalRoundTime.mockClear();
});

test("an empty config shows the built-in min of 3 and a blank max, with nothing to save", () => {
  render(<ScheduleSection config={{}} onResult={vi.fn()} />);
  expect(min().value).toBe("3");
  expect(max().value).toBe("");
  expect(save()).toBeDisabled();
});

test("a stored cap is shown", () => {
  render(<ScheduleSection config={{ minJudgesPerTeam: 2, maxJudgesPerTeam: 4 }} onResult={vi.fn()} />);
  expect(min().value).toBe("2");
  expect(max().value).toBe("4");
});

test("a blank max is saved as no cap", async () => {
  const onResult = vi.fn();
  render(<ScheduleSection config={{ minJudgesPerTeam: 3, maxJudgesPerTeam: 4 }} onResult={onResult} />);
  fireEvent.change(max(), { target: { value: "" } });
  fireEvent.click(save());
  await waitFor(() => expect(mock.setJudgesPerTeam).toHaveBeenCalledWith({ min: 3, max: null }));
  expect(onResult).toHaveBeenCalledWith({ ok: true }, "Judges per team set to at least 3");
});

test("a typed min and max are saved as numbers", async () => {
  render(<ScheduleSection config={{}} onResult={vi.fn()} />);
  fireEvent.change(min(), { target: { value: "2" } });
  fireEvent.change(max(), { target: { value: "5" } });
  fireEvent.click(save());
  await waitFor(() => expect(mock.setJudgesPerTeam).toHaveBeenCalledWith({ min: 2, max: 5 }));
});

describe("the final round time", () => {
  const time = () => screen.getByLabelText("Final round time");
  const saveTime = () => screen.getAllByRole("button", { name: "Save" })[3];

  test("unset is blank with nothing to save", () => {
    render(<ScheduleSection config={{}} onResult={vi.fn()} />);
    expect(time().value).toBe("");
    expect(saveTime()).toBeDisabled();
  });

  test("a typed time is saved", async () => {
    const onResult = vi.fn();
    render(<ScheduleSection config={{}} onResult={onResult} />);
    fireEvent.change(time(), { target: { value: "7:00 PM" } });
    fireEvent.click(saveTime());
    await waitFor(() => expect(mock.setFinalRoundTime).toHaveBeenCalledWith("7:00 PM"));
    expect(onResult).toHaveBeenCalledWith({ ok: true }, "Final round time set to 7:00 PM");
  });

  test("emptying a stored time saves it as cleared", async () => {
    const onResult = vi.fn();
    render(<ScheduleSection config={{ finalRoundTime: "7:00 PM" }} onResult={onResult} />);
    expect(time().value).toBe("7:00 PM");
    fireEvent.change(time(), { target: { value: "" } });
    fireEvent.click(saveTime());
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ ok: true }, "Final round time cleared"));
  });
});
