/**
 * The scheduling maths.
 *
 * These are the invariants an organizer is entitled to assume when they press
 * Generate Schedule, so they are asserted across the whole plausible range of
 * events rather than at a couple of hand-picked sizes. Every one of them was
 * either broken or unenforced at some point:
 *
 *   - a judge in two rooms at once simply does not turn up to one of them
 *   - a team with no judges presents to an empty room
 *   - forty judges in one room is not better judging, it is a crowd
 */
import {
  splitIntoBatches,
  allocateBatch,
  describeSupply,
  BATCH_COUNT,
  TARGET_JUDGES_PER_TEAM,
  MIN_JUDGES_PER_TEAM,
} from "./schedulePlan";

/** Every (teams, judges, batches) the generator would accept. */
function* schedulableEvents() {
  for (let teams = 2; teams <= 60; teams++) {
    for (let judges = 1; judges <= 40; judges++) {
      for (const batchCount of [2, 3, 4, 5]) {
        const sizes = splitIntoBatches(Array.from({ length: teams }), batchCount)
          .map((b) => b.length)
          .filter(Boolean);
        if (judges < Math.max(...sizes)) continue; // generation refuses this
        yield { teams, judges, batchCount, sizes };
      }
    }
  }
}

describe("splitIntoBatches", () => {
  test("splits evenly when it divides", () => {
    expect(splitIntoBatches([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  test("sizes differ by at most one, with the remainder at the front", () => {
    const batches = splitIntoBatches([1, 2, 3, 4, 5, 6, 7], 3);
    expect(batches.map((b) => b.length)).toEqual([3, 2, 2]);
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

describe("allocateBatch holds its invariants across every schedulable event", () => {
  test("no judge is sent to two rooms in the same batch", () => {
    const broken = [];
    for (const { teams, judges, batchCount, sizes } of schedulableEvents()) {
      sizes.forEach((size, batchIndex) => {
        const seen = new Set();
        for (const panel of allocateBatch({ judgeCount: judges, batchSize: size, batchIndex })) {
          for (const judge of panel) {
            if (seen.has(judge)) broken.push(`${teams}/${judges}/${batchCount}`);
            seen.add(judge);
          }
        }
      });
    }
    expect(broken).toEqual([]);
  });

  test("every team gets at least one judge", () => {
    const broken = [];
    for (const { teams, judges, batchCount, sizes } of schedulableEvents()) {
      sizes.forEach((size, batchIndex) => {
        const panels = allocateBatch({ judgeCount: judges, batchSize: size, batchIndex });
        if (panels.some((panel) => panel.length === 0)) broken.push(`${teams}/${judges}/${batchCount}`);
      });
    }
    expect(broken).toEqual([]);
  });

  test("panels within a batch differ in size by at most one", () => {
    const broken = [];
    for (const { teams, judges, batchCount, sizes } of schedulableEvents()) {
      sizes.forEach((size, batchIndex) => {
        const lengths = allocateBatch({ judgeCount: judges, batchSize: size, batchIndex })
          .map((panel) => panel.length);
        if (Math.max(...lengths) - Math.min(...lengths) > 1) {
          broken.push(`${teams}/${judges}/${batchCount} -> ${lengths}`);
        }
      });
    }
    expect(broken).toEqual([]);
  });

  test("no panel ever exceeds the target, however many judges turn up", () => {
    const broken = [];
    for (const { teams, judges, batchCount, sizes } of schedulableEvents()) {
      sizes.forEach((size, batchIndex) => {
        for (const panel of allocateBatch({ judgeCount: judges, batchSize: size, batchIndex })) {
          if (panel.length > TARGET_JUDGES_PER_TEAM) {
            broken.push(`${teams}/${judges}/${batchCount} -> panel of ${panel.length}`);
          }
        }
      });
    }
    expect(broken).toEqual([]);
  });

  test("nobody is idle while a team is still below the target", () => {
    const broken = [];
    for (const { teams, judges, batchCount, sizes } of schedulableEvents()) {
      sizes.forEach((size, batchIndex) => {
        if (judges >= size * TARGET_JUDGES_PER_TEAM) return; // surplus is expected
        const used = new Set(allocateBatch({ judgeCount: judges, batchSize: size, batchIndex }).flat());
        if (used.size !== judges) broken.push(`${teams}/${judges}/${batchCount}`);
      });
    }
    expect(broken).toEqual([]);
  });
});

describe("a surplus of judges is capped, not crammed into the rooms", () => {
  test("four teams and forty judges gives panels of three, not of forty", () => {
    // the old allocator sent every judge to a team in every batch, which put
    // 20 people in one room and 40 in another
    const panels = allocateBatch({ judgeCount: 40, batchSize: 2, batchIndex: 0 });
    expect(panels.map((p) => p.length)).toEqual([3, 3]);
  });

  test("the judges held back differ from batch to batch", () => {
    const spare = [0, 1, 2].map((batchIndex) => {
      const used = new Set(allocateBatch({ judgeCount: 20, batchSize: 2, batchIndex }).flat());
      return [...Array(20).keys()].filter((j) => !used.has(j)).join(",");
    });
    expect(new Set(spare).size).toBeGreaterThan(1);
  });

  test("judges do not tour the building with the same colleagues", () => {
    // the failure this guards is a seat cycle that locks judges into fixed
    // groups mod batchSize, so the same three people see every room together
    const seen = new Set();
    let repeats = 0;
    for (let batchIndex = 0; batchIndex < 3; batchIndex++) {
      for (const panel of allocateBatch({ judgeCount: 12, batchSize: 4, batchIndex })) {
        for (let i = 0; i < panel.length; i++) {
          for (let k = i + 1; k < panel.length; k++) {
            const key = [panel[i], panel[k]].sort((a, b) => a - b).join("-");
            if (seen.has(key)) repeats += 1;
            else seen.add(key);
          }
        }
      }
    }
    expect(repeats).toBeLessThan(12); // a locked cycle produces 24 of 36
  });
});

describe("describeSupply refuses with an actionable reason", () => {
  const base = { teamCount: 20, judgeCount: 12, roomCount: 10, batchCount: 3 };

  test("no rooms is its own problem, not 'not enough rooms'", () => {
    const result = describeSupply({ ...base, roomCount: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No judging rooms are configured/);
  });

  test("too few rooms says how many more, and offers the batch count instead", () => {
    const result = describeSupply({ ...base, roomCount: 4 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Add 3 more room/);
    expect(result.error).toMatch(/raise the batch count to 5/);
  });

  test("too few judges says how many more, and offers the batch count instead", () => {
    const result = describeSupply({ teamCount: 20, judgeCount: 3, roomCount: 10, batchCount: 3 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/3 judges cannot cover/);
    expect(result.error).toMatch(/more first-round judge|raise the batch count/);
  });

  test("nothing to judge is reported before anything else", () => {
    expect(describeSupply({ ...base, teamCount: 0 }).error).toMatch(/nothing to judge/);
  });
});

describe("describeSupply warns about what the organizer can still fix", () => {
  test("a one-judge team is called out, with the number of judges to add", () => {
    const result = describeSupply({ teamCount: 20, judgeCount: 8, roomCount: 10, batchCount: 3 });
    expect(result.ok).toBe(true);
    expect(result.judgesPerTeam.min).toBeLessThan(MIN_JUDGES_PER_TEAM);
    expect(result.warnings.join(" ")).toMatch(/only 1 judge/);
    expect(result.advice.join(" ")).toMatch(/Mark \d+ more first-round judge/);
  });

  test("uneven batches are explained, with a batch count that divides evenly", () => {
    const result = describeSupply({ teamCount: 20, judgeCount: 12, roomCount: 10, batchCount: 3 });
    expect(result.batchSizes).toEqual([7, 7, 6]);
    expect(result.advice.join(" ")).toMatch(/batch count of/);
  });

  test("an even split produces no batch-shape advice", () => {
    const result = describeSupply({ teamCount: 18, judgeCount: 12, roomCount: 10, batchCount: 3 });
    expect(result.batchSizes).toEqual([6, 6, 6]);
    expect(result.advice.join(" ")).not.toMatch(/divides/);
  });

  test("a surplus of judges is reported as spares rather than silently seated", () => {
    const result = describeSupply({ teamCount: 6, judgeCount: 30, roomCount: 10, batchCount: 3 });
    expect(result.ok).toBe(true);
    expect(result.judgesPerTeam.max).toBeLessThanOrEqual(TARGET_JUDGES_PER_TEAM);
    expect(result.warnings.join(" ")).toMatch(/more than .* teams need/);
    expect(result.advice.join(" ")).toMatch(/spare|Spare/);
  });

  test("a well-staffed event is clean", () => {
    const result = describeSupply({ teamCount: 18, judgeCount: 18, roomCount: 10, batchCount: 3 });
    expect(result.ok).toBe(true);
    expect(result.judgesPerTeam).toEqual({ min: 3, max: 3 });
    expect(result.warnings).toEqual([]);
  });
});
