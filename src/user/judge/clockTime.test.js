import { parseClockTime, formatClockTime, normalizeClockTime, sameClockTime } from "./clockTime";

describe("parseClockTime", () => {
  test.each([
    ["5:00 PM", 17 * 60],
    ["4:45 PM", 16 * 60 + 45],
    ["12:00 AM", 0],
    ["12:30 AM", 30],
    ["12:00 PM", 12 * 60],
    ["11:59 PM", 23 * 60 + 59],
    ["1:05 AM", 65],
  ])("reads %s", (text, minutes) => {
    expect(parseClockTime(text)).toBe(minutes);
  });

  test.each([
    [" 5:00 pm ", 17 * 60],
    ["5:00PM", 17 * 60],
    ["5:00 Pm", 17 * 60],
    ["05:00 PM", 17 * 60],
    ["5 PM", 17 * 60],
    ["5pm", 17 * 60],
  ])("is forgiving about %j", (text, minutes) => {
    expect(parseClockTime(text)).toBe(minutes);
  });

  test.each(["banana", "", "   ", "25:99 XM", "13:00 PM", "0:30 AM", "5:60 PM", "5:00", "17:00", "5:0 PM", "5:00 PM extra", "5:00:00 PM"])(
    "rejects %j",
    (text) => {
      expect(parseClockTime(text)).toBeNull();
    },
  );

  test("rejects non-strings", () => {
    expect(parseClockTime(undefined)).toBeNull();
    expect(parseClockTime(null)).toBeNull();
  });
});

describe("formatClockTime", () => {
  test.each([
    [0, "12:00 AM"],
    [30, "12:30 AM"],
    [12 * 60, "12:00 PM"],
    [17 * 60, "5:00 PM"],
    [16 * 60 + 5, "4:05 PM"],
    [23 * 60 + 59, "11:59 PM"],
  ])("%i minutes is %s", (minutes, text) => {
    expect(formatClockTime(minutes)).toBe(text);
  });
});

describe("normalizeClockTime", () => {
  test("rewrites to the canonical form", () => {
    expect(normalizeClockTime(" 05:00pm ")).toBe("5:00 PM");
    expect(normalizeClockTime("5 pm")).toBe("5:00 PM");
  });

  test("is null for non-times", () => {
    expect(normalizeClockTime("banana")).toBeNull();
  });
});

describe("sameClockTime", () => {
  test("ignores spelling", () => {
    expect(sameClockTime("5:00 PM", "5pm")).toBe(true);
    expect(sameClockTime("5:00 PM", "5:00 AM")).toBe(false);
  });

  test("is false when either side is not a time, even if both are the same junk", () => {
    expect(sameClockTime("banana", "banana")).toBe(false);
    expect(sameClockTime("5:00 PM", "banana")).toBe(false);
  });
});
