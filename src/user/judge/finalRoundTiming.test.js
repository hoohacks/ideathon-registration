/**
 * Finalists' clock times. Publishing writes "Slot 1", "Slot 2"; with
 * config/finalRoundTime and config/finalRoundSlotMinutes set, every reader shows
 * "5:30 PM", "5:40 PM" instead, live.
 */
vi.mock("../../firebase.js", () => ({ database: {} }));
vi.mock("firebase/database", async () => (await import("../../testing/fakeDatabase")).module);
const db = await import("../../testing/fakeDatabase");
const { finalTiming, finalSlotTime, subscribeToFinalRoundTiming } = await import("./finalRoundTiming.js");

beforeEach(() => db.reset());

describe("finalTiming", () => {
  test("needs both a start and a slot length", () => {
    expect(finalTiming("5:30 PM", 10)).toEqual({ startMinutes: 17 * 60 + 30, slotMinutes: 10 });
    expect(finalTiming("5:30 PM", null)).toBeNull();
    expect(finalTiming(null, 10)).toBeNull();
    expect(finalTiming("5:30 PM", 0)).toBeNull();
    expect(finalTiming("5:30 PM", 7.5)).toBeNull();
    expect(finalTiming("after dinner", 10)).toBeNull();
  });
});

describe("finalSlotTime", () => {
  const timing = finalTiming("5:30 PM", 10);

  test("counts on from the start, one slot length per finalist", () => {
    expect(["Slot 1", "Slot 2", "Slot 4"].map((label) => finalSlotTime(label, timing))).toEqual([
      "5:30 PM", "5:40 PM", "6:00 PM",
    ]);
  });

  test("without timing, the label is unchanged", () => {
    expect(finalSlotTime("Slot 2", null)).toBe("Slot 2");
  });

  test("a time typed onto a forced entry is left alone", () => {
    expect(finalSlotTime("6:10 PM", timing)).toBe("6:10 PM");
  });

  test("past midnight wraps rather than printing hour 24", () => {
    expect(finalSlotTime("Slot 2", finalTiming("11:55 PM", 10))).toBe("12:05 AM");
  });
});

describe("subscribeToFinalRoundTiming", () => {
  test("reports the start as typed and the timing, and follows changes", () => {
    db.reset({ config: { finalRoundTime: "5:30 PM" } });
    const seen = [];
    const off = subscribeToFinalRoundTiming((value) => seen.push(value));
    expect(seen.at(-1)).toEqual({ start: "5:30 PM", timing: null });

    db.setData("config/finalRoundSlotMinutes", 12);
    expect(seen.at(-1)).toEqual({ start: "5:30 PM", timing: { startMinutes: 17 * 60 + 30, slotMinutes: 12 } });

    off();
    db.setData("config/finalRoundTime", "6:00 PM");
    expect(seen.at(-1).start).toBe("5:30 PM");
  });
});
