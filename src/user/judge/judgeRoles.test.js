import { judgesRoundOne, judgePickerOptions } from "./judgeRoles";

const organizer = { firstName: "Ada", lastName: "Rivera", isRound1Judge: true, checkedIn: true };
const guest = { firstName: "Wei", lastName: "Chen", checkedIn: false };
const marked = { firstName: "Sam", lastName: "Okafor", isRound1Judge: true };

describe("who counts as a round-one judge", () => {
  test("only the round-one mark makes somebody a round-one judge", () => {
    expect(judgesRoundOne(organizer)).toBe(true);
    expect(judgesRoundOne(guest)).toBe(false);
  });

  test("only a literal true counts", () => {
    expect(judgesRoundOne({ isRound1Judge: "yes" })).toBe(false);
  });

  test("a missing record is nobody", () => {
    expect(judgesRoundOne(undefined)).toBe(false);
    expect(judgesRoundOne(null)).toBe(false);
  });
});

describe("the options a per-team judge picker offers", () => {
  const world = { o1: organizer, g1: guest, m1: marked };

  test("every judge is offered, marked or not", () => {
    expect(judgePickerOptions(world).map((option) => option.uid).sort())
      .toEqual(["g1", "m1", "o1"]);
  });

  test("a judge not marked for round one is flagged, because seating one is a deliberate reach", () => {
    const byUid = Object.fromEntries(judgePickerOptions(world).map((o) => [o.uid, o]));
    expect(byUid.g1.notRoundOne).toBe(true);
    expect(byUid.o1.notRoundOne).toBe(false);
    expect(byUid.m1.notRoundOne).toBe(false);
  });

  test("checked-in judges come first, then alphabetically", () => {
    expect(judgePickerOptions(world).map((option) => option.name))
      .toEqual(["Ada Rivera", "Sam Okafor", "Wei Chen"]);
  });

  test("a judge with no name still has something to click", () => {
    expect(judgePickerOptions({ x1: { isRound1Judge: true } })[0].name).toBe("Unnamed Judge");
  });

  test("no judges at all is an empty list, not a crash", () => {
    expect(judgePickerOptions(undefined)).toEqual([]);
  });
});
