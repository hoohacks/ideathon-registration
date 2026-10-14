/**
 * The whole Build step, over thousands of event sizes, against an in-memory
 * database: rooms, times, panels, refusals, and the advice a refusal gives.
 *
 * schedulePlan.test.js sweeps the allocator on its own. This sweeps what an
 * organizer actually presses -- planSchedule reading teams, judges, rooms and
 * config -- and then publishes a share of the plans and reads back what every
 * team and judge would see.
 *
 * The event's real settings are the main grid: at least 3 judges per team, no
 * cap, 3 batches. Every other batch count and a few caps are swept more
 * coarsely, because they are settings an organizer can still change on the day.
 */
vi.mock("../../firebase.js", () => ({ database: {} }));
vi.mock("firebase/database", async () => (await import("../../testing/fakeDatabase")).module);
vi.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));

const db = await import("../../testing/fakeDatabase");
const { planSchedule } = await import("./planSchedule");
const { publishPlan } = await import("./publishPlan");
const {
  eventTree, describeEvent, batchSizesFor, generatedPlanViolations, publishedViolations,
} = await import("../../testing/eventWorld");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const range = (from, to, step = 1) => {
  const out = [];
  for (let n = from; n <= to; n += step) out.push(n);
  return out;
};

/** What the planner should decide, worked out without it. */
function shouldSchedule({ teams, judges, rooms, batches = 3 }) {
  if (teams < 1 || judges < 1 || rooms < 1) return false;
  const largest = Math.max(...batchSizesFor(teams, batches));
  return largest <= rooms && largest <= judges;
}

async function build(event, options) {
  db.reset(eventTree(event));
  return planSchedule(options);
}

/**
 * Build every event, collecting every way any of them went wrong, so a failure
 * lists all the broken sizes rather than the first.
 */
async function sweep(events, check) {
  const broken = [];
  for (const event of events) {
    const result = await build(event);
    for (const problem of check(event, result)) broken.push(`${describeEvent(event)}: ${problem}`);
  }
  return broken;
}

/** The checks every build has to pass, whatever the event. */
function buildChecks(event, result) {
  const problems = [];
  const { min = 3, max = null } = event;
  const expected = shouldSchedule(event);

  if (result.ok !== expected) {
    problems.push(`ok=${result.ok}, expected ${expected} (${result.error ?? "no error"})`);
    return problems;
  }
  if (!result.ok) {
    if (!result.error) problems.push("refused with no reason");
    return problems;
  }

  problems.push(...generatedPlanViolations(result.plan, { min, max, finalOnlyIds: finalOnlyIds(event) }));

  // the below-min warning appears exactly when some team is below the min
  const panels = Object.values(result.plan.assignments).map((a) => a.judges.length);
  const belowMin = Math.min(...panels) < min;
  const warned = result.warnings.some((w) => /below the minimum/.test(w));
  if (belowMin !== warned) problems.push(`below min is ${belowMin} but the warning says ${warned}`);

  // with no cap, nobody is ever a spare
  if (max == null && result.warnings.some((w) => /spares/.test(w))) problems.push("spares reported with no cap");
  return problems;
}

const finalOnlyIds = (event) =>
  Array.from({ length: event.finalOnly ?? 0 }, (_, i) => `f${String(i).padStart(4, "0")}`);

// ---------------------------------------------------------------------------

describe("the event's own settings: min 3, no cap, 3 batches", () => {
  test("every size from 1 to 75 teams and 1 to 75 judges, with exactly the rooms needed", async () => {
    const events = [];
    for (const teams of range(1, 75)) {
      for (const judges of range(1, 75)) {
        events.push({ teams, judges, rooms: Math.ceil(teams / 3) });
      }
    }
    expect(await sweep(events, buildChecks)).toEqual([]);
  }, 120_000);

  test("one room short is always refused, however many judges there are", async () => {
    const events = range(2, 120).flatMap((teams) =>
      [teams, teams * 3, 400].map((judges) => ({ teams, judges, rooms: Math.ceil(teams / 3) - 1 }))
    );
    expect(await sweep(events, buildChecks)).toEqual([]);
  }, 60_000);

  test("large events: hundreds of teams and judges, on both sides of every threshold", async () => {
    const events = [];
    for (const teams of [99, 100, 101, 150, 200, 299, 300, 301, 450, 600]) {
      const largest = Math.ceil(teams / 3);
      for (const judges of [
        1, largest - 1, largest, largest + 1, // the floor of one judge per team
        largest * 3 - 1, largest * 3, largest * 3 + 1, // the min of three
        teams * 2, 1000,
      ]) {
        for (const rooms of [largest - 1, largest, largest + 50]) {
          events.push({ teams, judges, rooms });
        }
      }
    }
    expect(await sweep(events, buildChecks)).toEqual([]);
  }, 120_000);

  test("tiny events: no teams, no judges, no rooms, one of each", async () => {
    const events = [];
    for (const teams of [0, 1, 2, 3]) {
      for (const judges of [0, 1, 2, 3]) {
        for (const rooms of [0, 1, 2]) events.push({ teams, judges, rooms });
      }
    }
    expect(await sweep(events, buildChecks)).toEqual([]);
  });

  test("final-only judges, absent judges and unsubmitted teams never change who is scheduled", async () => {
    const events = [];
    for (const teams of [1, 7, 30, 90]) {
      for (const judges of [3, 12, 40, 100]) {
        events.push({ teams, judges, rooms: 40, finalOnly: 25, unsubmitted: 10, absent: 0 });
      }
    }
    const broken = await sweep(events, (event, result) => {
      const problems = buildChecks(event, result);
      if (result.ok) {
        const placed = Object.keys(result.plan.assignments);
        if (placed.some((id) => id.startsWith("u"))) problems.push("an unsubmitted team was scheduled");
        if (placed.length !== event.teams) problems.push(`${placed.length} teams placed, ${event.teams} submitted`);
      }
      return problems;
    });
    expect(broken).toEqual([]);
  }, 60_000);
});

describe("checked-in only", () => {
  test("only judges who arrived are seated, and the refusal counts only them", async () => {
    const broken = [];
    for (const teams of [3, 10, 30, 60]) {
      for (const judges of [10, 30, 90]) {
        for (const absent of [0, 1, Math.floor(judges / 2), judges - 1, judges]) {
          const event = { teams, judges, absent, rooms: 30 };
          db.reset(eventTree(event));
          const result = await planSchedule({ onlyCheckedIn: true });
          const present = judges - absent;
          const expected = shouldSchedule({ ...event, judges: present });
          if (result.ok !== expected) {
            broken.push(`${describeEvent(event)}: ok=${result.ok}, expected ${expected}`);
            continue;
          }
          if (!result.ok) continue;
          if (result.plan.basis.judgeIds.length !== present) broken.push(`${describeEvent(event)}: pool is not the present judges`);
          for (const p of generatedPlanViolations(result.plan)) broken.push(`${describeEvent(event)}: ${p}`);
          const seatedAbsent = Object.values(result.plan.assignments)
            .flatMap((a) => a.judges)
            .filter((j) => Number(j.judgeId.slice(1)) < absent);
          if (seatedAbsent.length) broken.push(`${describeEvent(event)}: an absent judge was seated`);
        }
      }
    }
    expect(broken).toEqual([]);
  }, 60_000);
});

describe("other batch counts and caps an organizer can still choose", () => {
  test("1 to 8 batches across small and large events", async () => {
    const events = [];
    for (const batches of range(1, 8)) {
      for (const teams of [1, 2, 5, 8, 13, 24, 37, 64, 100, 250]) {
        const largest = Math.max(...batchSizesFor(teams, batches));
        for (const judges of [1, largest - 1, largest, largest * 3, largest * 3 + 2, 500]) {
          for (const rooms of [largest - 1, largest, 200]) {
            events.push({ teams, judges, rooms, batches });
          }
        }
      }
    }
    expect(await sweep(events.filter((e) => e.judges >= 0 && e.rooms >= 0), buildChecks)).toEqual([]);
  }, 120_000);

  test("a cap holds judges back without leaving anyone idle below it", async () => {
    const events = [];
    for (const max of [3, 4, 6]) {
      for (const teams of [3, 10, 30, 99]) {
        for (const judges of [Math.ceil(teams / 3), teams, teams * 3, teams * 5]) {
          events.push({ teams, judges, rooms: 40, min: 3, max });
        }
      }
    }
    expect(await sweep(events, buildChecks)).toEqual([]);
  }, 60_000);

  test("a different min is what the warning measures against", async () => {
    const events = [];
    for (const min of [1, 2, 4, 5, 10]) {
      for (const teams of [6, 30]) {
        for (const judges of [teams / 3, (teams / 3) * min - 1, (teams / 3) * min, teams * 4]) {
          events.push({ teams, judges, rooms: 20, min });
        }
      }
    }
    expect(await sweep(events, buildChecks)).toEqual([]);
  });
});

describe("the advice an organizer is given actually works", () => {
  /** Rebuild `event` with `change` applied, and say whether it got past `problem`. */
  async function fixes(event, change, stillBroken) {
    const result = await build({ ...event, ...change });
    return !stillBroken(result);
  }

  test("every 'raise the batch count to N' and 'add N rooms or judges' gets past the refusal", async () => {
    const broken = [];
    for (const teams of [4, 10, 25, 61, 100, 333]) {
      for (const judges of [1, 3, 10, 40, 200]) {
        for (const rooms of [1, 4, 10, 30, 200]) {
          const event = { teams, judges, rooms };
          const result = await build(event);
          if (result.ok) continue;
          const name = describeEvent(event);
          const roomProblem = (r) => !r.ok && /rooms at once/.test(r.error);
          const judgeProblem = (r) => !r.ok && /judges cannot cover/.test(r.error);

          const moreRooms = result.error.match(/Add (\d+) more room/);
          if (moreRooms && !(await fixes(event, { rooms: rooms + Number(moreRooms[1]) }, roomProblem))) {
            broken.push(`${name}: adding ${moreRooms[1]} rooms still too few rooms`);
          }
          const moreJudges = result.error.match(/mark (\d+) more first-round/i);
          if (moreJudges && !(await fixes(event, { judges: judges + Number(moreJudges[1]) }, judgeProblem))) {
            broken.push(`${name}: marking ${moreJudges[1]} more judges still too few judges`);
          }
          const batches = result.error.match(/raise the batch count to (\d+)/);
          if (batches) {
            const stillRefused = roomProblem(result) ? roomProblem : judgeProblem;
            if (!(await fixes(event, { batches: Number(batches[1]) }, stillRefused))) {
              broken.push(`${name}: ${batches[1]} batches does not fix "${result.error}"`);
            }
          }
          if (!moreRooms && !moreJudges && !batches) broken.push(`${name}: refused with no number to act on`);
        }
      }
    }
    expect(broken).toEqual([]);
  }, 60_000);

  test("'mark N more judges to give every team at least 3' does exactly that", async () => {
    const broken = [];
    for (const teams of range(3, 90, 4)) {
      for (const judges of [Math.ceil(teams / 3), teams, teams + 5]) {
        const event = { teams, judges, rooms: 40 };
        const result = await build(event);
        const advice = result.advice?.join(" ").match(/Mark (\d+) more first-round judge/);
        if (!advice) continue;
        const after = await build({ ...event, judges: judges + Number(advice[1]) });
        const smallest = Math.min(...Object.values(after.plan.assignments).map((a) => a.judges.length));
        if (smallest < 3) broken.push(`${describeEvent(event)}: +${advice[1]} judges still leaves a panel of ${smallest}`);
      }
    }
    expect(broken).toEqual([]);
  });

  test("a batch count offered to even out the split can actually be built", async () => {
    const broken = [];
    for (const teams of range(4, 120)) {
      for (const judges of [Math.ceil(teams / 3), Math.ceil(teams / 3) + 2, teams, teams * 3]) {
        const event = { teams, judges, rooms: Math.ceil(teams / 3) + 10 };
        const result = await build(event);
        const offered = result.advice?.join(" ").match(/A batch count of ([\d, or]+) divides/);
        if (!offered) continue;
        for (const batches of offered[1].split(/,|or/).map((s) => Number(s.trim())).filter(Boolean)) {
          const after = await build({ ...event, batches });
          if (!after.ok) broken.push(`${describeEvent(event)}: offered ${batches} batches, which is refused: ${after.error}`);
        }
      }
    }
    expect(broken).toEqual([]);
  }, 60_000);
});

describe("what lands when the plan is published", () => {
  test("every team's card and every judge's list agree with the plan, at every scale", async () => {
    const broken = [];
    const events = [
      { teams: 1, judges: 1, rooms: 1 },
      { teams: 1, judges: 3, rooms: 1 },
      { teams: 3, judges: 3, rooms: 1 },
      { teams: 3, judges: 9, rooms: 1 },
      { teams: 8, judges: 12, rooms: 8 },
      { teams: 24, judges: 8, rooms: 8 },
      { teams: 24, judges: 24, rooms: 8 },
      { teams: 25, judges: 30, rooms: 9 },
      { teams: 60, judges: 60, rooms: 20, finalOnly: 10, unsubmitted: 5 },
      { teams: 150, judges: 160, rooms: 50 },
      { teams: 300, judges: 400, rooms: 100, unsubmitted: 30 },
    ];
    for (const event of events) {
      const result = await build(event);
      if (!result.ok) {
        broken.push(`${describeEvent(event)}: did not build: ${result.error}`);
        continue;
      }
      const published = await publishPlan(result.plan);
      if (!published.ok) {
        broken.push(`${describeEvent(event)}: did not publish: ${published.error}`);
        continue;
      }
      for (const p of publishedViolations(result.plan, db.getData(""))) broken.push(`${describeEvent(event)}: ${p}`);
    }
    expect(broken).toEqual([]);
  }, 120_000);

  test("publishing twice in a row, before any scores, lands the second plan cleanly", async () => {
    db.reset(eventTree({ teams: 30, judges: 40, rooms: 10 }));
    const first = (await planSchedule()).plan;
    expect((await publishPlan(first)).ok).toBe(true);

    // a team withdraws and the schedule is rebuilt from scratch
    db.setData("teams/t0003/submitted", null);
    const second = (await planSchedule()).plan;
    expect((await publishPlan(second)).ok).toBe(true);
    expect(publishedViolations(second, db.getData(""))).toEqual([]);
    expect(db.getData("teams/t0003/schedule")).toBeNull();
  });
});
