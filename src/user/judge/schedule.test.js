/**
 * The scheduling maths.
 *
 * `teamIndexFor` is the least obvious code in the project — it exists so judges
 * do not walk the same three rooms as the same colleagues — and it had no tests
 * at all. The invariant it has to hold is easy to state and easy to break:
 * every judge sees exactly one team per batch, and every team in a batch is
 * covered.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));
jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: jest.fn(async () => ({ exists: () => false, val: () => null })),
  update: jest.fn(async () => {}),
  serverTimestamp: () => 0,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: null }) }));

const { splitIntoBatches, teamIndexFor, BATCH_COUNT } = require("./getJudgeSchedule");

describe("splitIntoBatches", () => {
  test("splits evenly when it divides", () => {
    expect(splitIntoBatches([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  test("sizes differ by at most one, with the remainder at the front", () => {
    const batches = splitIntoBatches([1, 2, 3, 4, 5, 6, 7], 3);
    expect(batches.map((b) => b.length)).toEqual([3, 2, 2]);
    expect(Math.max(...batches.map((b) => b.length)) -
      Math.min(...batches.map((b) => b.length))).toBeLessThanOrEqual(1);
  });

  test("keeps every item exactly once", () => {
    const items = Array.from({ length: 17 }, (_, i) => i);
    expect(splitIntoBatches(items, 3).flat()).toEqual(items);
  });

  test("copes with fewer teams than batches", () => {
    expect(splitIntoBatches([1, 2], 3).map((b) => b.length)).toEqual([1, 1, 0]);
  });

  test("copes with nothing to schedule", () => {
    expect(splitIntoBatches([], 3)).toEqual([[], [], []]);
  });

  test("defaults to the configured batch count", () => {
    expect(splitIntoBatches([1, 2, 3])).toHaveLength(BATCH_COUNT);
  });
});

describe("teamIndexFor", () => {
  test("always lands inside the batch", () => {
    for (let size = 1; size <= 12; size++) {
      for (let judge = 0; judge < 40; judge++) {
        for (let batch = 0; batch < BATCH_COUNT; batch++) {
          const seat = teamIndexFor(judge, batch, size);
          expect(seat).toBeGreaterThanOrEqual(0);
          expect(seat).toBeLessThan(size);
        }
      }
    }
  });

  test("every team in a batch is covered when judges divide evenly", () => {
    const size = 4;
    const judges = 8;
    for (let batch = 0; batch < BATCH_COUNT; batch++) {
      const seats = new Set();
      for (let judge = 0; judge < judges; judge++) {
        seats.add(teamIndexFor(judge, batch, size));
      }
      expect(seats.size).toBe(size);
    }
  });

  test("each complete block of `size` judges covers every team exactly once", () => {
    // this is the property that keeps the split perfectly even -- it is what
    // the rotation must not break
    const size = 5;
    for (let batch = 0; batch < BATCH_COUNT; batch++) {
      for (let block = 0; block < 4; block++) {
        const seats = [];
        for (let i = 0; i < size; i++) {
          seats.push(teamIndexFor(block * size + i, batch, size));
        }
        expect([...new Set(seats)].sort()).toEqual([...Array(size).keys()]);
      }
    }
  });

  test("judges do not walk the rooms with the same colleagues every time", () => {
    // plain `judge % size` would put the same block together in all three
    // batches; the rotation exists specifically to avoid that
    const size = 4;
    const judges = 12;
    const pairings = new Set();
    let repeats = 0;

    for (let batch = 0; batch < BATCH_COUNT; batch++) {
      const rooms = new Map();
      for (let judge = 0; judge < judges; judge++) {
        const seat = teamIndexFor(judge, batch, size);
        rooms.set(seat, [...(rooms.get(seat) ?? []), judge]);
      }
      for (const group of rooms.values()) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const key = `${group[i]}-${group[j]}`;
            if (pairings.has(key)) repeats += 1;
            else pairings.add(key);
          }
        }
      }
    }

    const plainRoundRobinRepeats = (() => {
      const seen = new Set();
      let dupes = 0;
      for (let batch = 0; batch < BATCH_COUNT; batch++) {
        const rooms = new Map();
        for (let judge = 0; judge < judges; judge++) {
          const seat = judge % size;
          rooms.set(seat, [...(rooms.get(seat) ?? []), judge]);
        }
        for (const group of rooms.values()) {
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              const key = `${group[i]}-${group[j]}`;
              if (seen.has(key)) dupes += 1;
              else seen.add(key);
            }
          }
        }
      }
      return dupes;
    })();

    expect(repeats).toBeLessThan(plainRoundRobinRepeats);
  });
});
