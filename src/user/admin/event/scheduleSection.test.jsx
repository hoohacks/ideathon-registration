import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * The judges-per-team row. A blank max is how an organizer says "no cap", so it
 * has to reach the setter as null rather than as 0 or an empty string.
 */
const mock = vi.hoisted(() => ({
  setJudgesPerTeam: vi.fn(async () => ({ ok: true })),
  setFinalRoundTiming: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./eventConfig", () => ({
  setBatchCount: vi.fn(),
  setBatchTimes: vi.fn(),
  setFinalRoundRoom: vi.fn(),
  setFinalRoundTiming: mock.setFinalRoundTiming,
  setJudgesPerTeam: mock.setJudgesPerTeam,
}));

const { default: ScheduleSection } = await import("./ScheduleSection");

const min = () => screen.getByLabelText("Min judges per team");
const max = () => screen.getByLabelText("Max judges per team");
// Batches, then this row, then the final round room; "Save times" is its own name
const save = () => screen.getAllByRole("button", { name: "Save" })[1];

beforeEach(() => Object.values(mock).forEach((fn) => fn.mockClear()));

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

describe("final round times", () => {
  const start = () => screen.getByLabelText("Final round start");
  const minutes = () => screen.getByLabelText("Minutes per finalist");
  // Batches, judges per team, final round room, then this row
  const saveTiming = () => screen.getAllByRole("button", { name: "Save" })[3];

  test("unset shows blanks, with nothing to save", () => {
    render(<ScheduleSection config={{}} onResult={vi.fn()} />);
    expect(start()).toHaveValue("");
    expect(minutes()).toHaveValue(null);
    expect(saveTiming()).toBeDisabled();
  });

  test("a typed start and slot length are saved, the length as a number", async () => {
    render(<ScheduleSection config={{}} onResult={vi.fn()} />);
    fireEvent.change(start(), { target: { value: "17:30" } });
    fireEvent.change(minutes(), { target: { value: "10" } });
    fireEvent.click(saveTiming());
    await waitFor(() =>
      expect(mock.setFinalRoundTiming).toHaveBeenCalledWith({ start: "17:30", slotMinutes: 10 })
    );
  });

  test("a stored start is shown in the time picker", () => {
    render(
      <ScheduleSection config={{ finalRoundStart: "5:30 PM", finalRoundSlotMinutes: 10 }} onResult={vi.fn()} />
    );
    expect(start()).toHaveAttribute("type", "time");
    expect(start()).toHaveValue("17:30");
    expect(minutes()).toHaveValue(10);
    expect(saveTiming()).toBeDisabled();
  });

  test("clearing both saves blanks as no timing", async () => {
    render(
      <ScheduleSection config={{ finalRoundStart: "5:30 PM", finalRoundSlotMinutes: 10 }} onResult={vi.fn()} />
    );
    fireEvent.change(start(), { target: { value: "" } });
    fireEvent.change(minutes(), { target: { value: "" } });
    fireEvent.click(saveTiming());
    await waitFor(() =>
      expect(mock.setFinalRoundTiming).toHaveBeenCalledWith({ start: "", slotMinutes: null })
    );
  });
});
