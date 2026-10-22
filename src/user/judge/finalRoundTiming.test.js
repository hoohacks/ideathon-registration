/**
 * Final round times: config/finalRoundStart and config/finalRoundSlotMinutes
 * turn "Slot 2" into "5:40 PM", and the readers that sort published slots have
 * to put "10:00 AM" after "9:30 AM".
 */
import {
  parseClock, formatClock, finalTiming, slotTime, slotOrder, compareSlots,
} from "./finalRoundPlan.js";

describe("parseClock", () => {
  test.each([
    ["5:30 PM", 17 * 60 + 30],
    ["5:30pm", 17 * 60 + 30],
    ["5 PM", 17 * 60],
    ["12:00 AM", 0],
    ["12:15 PM", 12 * 60 + 15],
    ["9:05 a.m.", 9 * 60 + 5],
    ["17:30", 17 * 60 + 30],
    ["  4:45 PM ", 16 * 60 + 45],
  ])("%s", (text, minutes) => {
    expect(parseClock(text)).toBe(minutes);
  });

  test.each(["", null, "5", "13:00 PM", "0:30 AM", "5:60 PM", "24:00", "soon", "Slot 1"])(
    "%s is not a time",
    (text) => {
      expect(parseClock(text)).toBeNull();
    }
  );
});

describe("formatClock", () => {
  test("writes times the way the batch times are written", () => {
    expect(formatClock(17 * 60 + 5)).toBe("5:05 PM");
    expect(formatClock(0)).toBe("12:00 AM");
    expect(formatClock(12 * 60)).toBe("12:00 PM");
  });

  test("wraps past midnight rather than printing 25:00", () => {
    expect(formatClock(24 * 60 + 10)).toBe("12:10 AM");
  });
});

describe("finalTiming", () => {
  test("needs both a start and a slot length", () => {
    expect(finalTiming("5:30 PM", 10)).toEqual({ startMinutes: 17 * 60 + 30, slotMinutes: 10 });
    expect(finalTiming("5:30 PM", null)).toBeNull();
    expect(finalTiming(null, 10)).toBeNull();
    expect(finalTiming("5:30 PM", 0)).toBeNull();
    expect(finalTiming("5:30 PM", 7.5)).toBeNull();
    expect(finalTiming("whenever", 10)).toBeNull();
  });
});

describe("slotTime", () => {
  test("counts on from the start, one slot length per finalist", () => {
    const timing = finalTiming("5:30 PM", 10);
    expect([0, 1, 2, 3].map((order) => slotTime(order, timing))).toEqual([
      "5:30 PM", "5:40 PM", "5:50 PM", "6:00 PM",
    ]);
  });

  test("falls back to the slot label with no timing", () => {
    expect(slotTime(1, null)).toBe("Slot 2");
  });
});

describe("sorting published slots", () => {
  test("clock times sort by time, not as text", () => {
    expect(["10:00 AM", "9:30 AM", "1:00 PM"].sort(compareSlots)).toEqual([
      "9:30 AM", "10:00 AM", "1:00 PM",
    ]);
  });

  test("slot labels still sort by number", () => {
    expect(["Slot 10", "Slot 2"].sort(compareSlots)).toEqual(["Slot 2", "Slot 10"]);
  });

  test("free text still sorts last", () => {
    expect(slotOrder("after lunch")).toBe(Infinity);
    expect(["after lunch", "5:30 PM"].sort(compareSlots)).toEqual(["5:30 PM", "after lunch"]);
  });
});
