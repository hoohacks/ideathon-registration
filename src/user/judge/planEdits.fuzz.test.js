/**
 * Random hand edits and random changes to the event, thrown at real plans.
 *
 * applyEdit.test.js and checkDrift.test.js pin each edit and each repair one at
 * a time. What they cannot show is a long session: an organizer clicking for
 * twenty minutes, undoing, being refused, while teams submit late and a room is
 * renamed under them -- and then pressing Publish. Every run here is seeded, so
 * a failure names the seed that reproduces it.
 */
vi.mock("../../firebase.js", () => ({ database: {} }));
vi.mock("firebase/database", async () => (await import("../../testing/fakeDatabase")).module);
vi.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));

const db = await import("../../testing/fakeDatabase");
const { planSchedule } = await import("./planSchedule");
const { publishPlan } = await import("./publishPlan");
const { applyEdit, applyRepair, undoEdit } = await import("./applyEdit");
const { checkDrift, readLiveBasis } = await import("./checkDrift");
const { computeStats } = await import("./computeStats");
const {
  eventTree, seededRandom, pick, planViolations, publishedViolations,
} = await import("../../testing/eventWorld");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const EVENTS = [
  { teams: 1, judges: 1, rooms: 1 },
  { teams: 3, judges: 3, rooms: 1 },
  { teams: 6, judges: 18, rooms: 2 },
  { teams: 9, judges: 10, rooms: 5 },
  { teams: 24, judges: 30, rooms: 8 },
  { teams: 25, judges: 75, rooms: 12 },
  { teams: 90, judges: 120, rooms: 30, finalOnly: 5 },
];

async function built(event) {
  db.reset(eventTree(event));
  const result = await planSchedule();
  if (!result.ok) throw new Error(`could not build ${JSON.stringify(event)}: ${result.error}`);
  return { ...result.plan, edits: [] };
}

/** One random edit, legal or not: the fuzzer should be refused as often as it succeeds. */
function randomOp(random, plan) {
  const teamIds = Object.keys(plan.assignments);
  const judgeIds = Object.keys(plan.judgeNames);
  const teamId = pick(random, [...teamIds, "nobody"]);
  const onTeam = plan.assignments[teamId]?.judges.map((j) => j.judgeId) ?? [];
  const judge = () => pick(random, random() < 0.5 && onTeam.length ? onTeam : judgeIds);

  switch (pick(random, ["addJudge", "addJudge", "removeJudge", "swapJudge", "moveTeam", "moveTeam", "bogus"])) {
    case "addJudge":
      return { type: "addJudge", teamId, judgeUid: judge() };
    case "removeJudge":
      return { type: "removeJudge", teamId, judgeUid: judge() };
    case "swapJudge":
      return { type: "swapJudge", teamId, fromUid: judge(), toUid: pick(random, judgeIds) };
    case "moveTeam":
      return {
        type: "moveTeam",
        teamId,
        batch: pick(random, [1, 2, 3, plan.basis.batchCount, 0, 99]),
        room: pick(random, [...plan.basis.rooms, "Nowhere"]),
      };
    default:
      return { type: "explode", teamId };
  }
}

describe("hundreds of random hand edits never produce an impossible schedule", () => {
  for (const event of EVENTS) {
    test(`${event.teams} teams, ${event.judges} judges, ${event.rooms} rooms`, async () => {
      const original = await built(event);
      const broken = [];

      for (let seed = 1; seed <= 25; seed++) {
        const random = seededRandom(seed * 7919 + event.teams);
        let plan = original;
        let accepted = 0;

        for (let step = 0; step < 200; step++) {
          const before = JSON.stringify(plan);

          if (random() < 0.15) {
            const undone = undoEdit(plan);
            if (undone.ok) plan = undone.plan;
            else if (plan.edits.length) broken.push(`seed ${seed} step ${step}: undo refused with edits left`);
          } else {
            const op = randomOp(random, plan);
            const result = applyEdit(plan, op);
            if (JSON.stringify(plan) !== before) broken.push(`seed ${seed} step ${step}: ${op.type} mutated its input`);
            if (result.ok) {
              plan = result.plan;
              accepted += 1;
            } else if (!result.error) {
              broken.push(`seed ${seed} step ${step}: ${op.type} refused with no reason`);
            }
          }

          for (const p of planViolations(plan)) broken.push(`seed ${seed} step ${step}: ${p}`);
          if (broken.length > 20) break;
        }
        if (broken.length > 20) break;

        // undoing everything returns exactly what the generator built
        let unwound = plan;
        while (unwound.edits.length) unwound = undoEdit(unwound).plan;
        if (JSON.stringify(unwound.assignments) !== JSON.stringify(original.assignments)) {
          broken.push(`seed ${seed}: undoing all ${plan.edits.length} edits did not return to the build`);
        }
        if (accepted === 0 && event.teams > 1) broken.push(`seed ${seed}: no edit was ever accepted`);
      }
      expect(broken).toEqual([]);
    }, 60_000);
  }

  test("a hand-edited plan that is still valid publishes, and lands exactly as edited", async () => {
    const broken = [];
    for (const event of EVENTS) {
      for (let seed = 1; seed <= 4; seed++) {
        const random = seededRandom(seed * 104729 + event.judges);
        let plan = await built(event);
        for (let step = 0; step < 60; step++) {
          const result = applyEdit(plan, randomOp(random, plan));
          if (result.ok) plan = result.plan;
        }
        // an organizer cannot publish an empty panel; give each one a free judge first
        plan = fillEmptyPanels(plan);
        const published = await publishPlan(plan);
        const label = `${event.teams}/${event.judges}/${event.rooms} seed ${seed}`;
        if (!published.ok) {
          broken.push(`${label}: refused: ${published.error}`);
          continue;
        }
        for (const p of publishedViolations(plan, db.getData(""))) broken.push(`${label}: ${p}`);
      }
    }
    expect(broken).toEqual([]);
  }, 120_000);
});

/**
 * Give every empty panel a judge, as an organizer would: somebody free in that
 * batch if there is anyone, otherwise one borrowed from the largest panel in
 * the batch. With no cap every judge is seated in every batch, so a late team
 * can only ever be judged by borrowing.
 */
function fillEmptyPanels(plan, pool = plan.basis.judgeIds) {
  let next = plan;
  for (const id of Object.keys(plan.assignments)) {
    const team = next.assignments[id];
    if (team.judges.length) continue;

    const free = pool.find((judgeUid) => applyEdit(next, { type: "addJudge", teamId: id, judgeUid }).ok);
    if (free) {
      next = applyEdit(next, { type: "addJudge", teamId: id, judgeUid: free }).plan;
      continue;
    }
    const donor = Object.values(next.assignments)
      .filter((a) => a.batch === team.batch && a.judges.length > 1)
      .sort((a, b) => b.judges.length - a.judges.length)[0];
    if (!donor) continue;
    const judgeUid = donor.judges.find((j) => pool.includes(j.judgeId))?.judgeId;
    if (!judgeUid) continue;
    next = applyEdit(next, { type: "removeJudge", teamId: donor.id, judgeUid }).plan;
    next = applyEdit(next, { type: "addJudge", teamId: id, judgeUid }).plan;
  }
  return next;
}

// ---------------------------------------------------------------------------

/** One random thing that can change in the database between Build and Publish. */
function changeTheWorld(random, tree, step) {
  const teamIds = Object.keys(tree.teams);
  const judgeIds = Object.keys(tree.judges).filter((id) => tree.judges[id].isRound1Judge);
  const rooms = tree.config.judgingRooms;

  switch (pick(random, ["lateTeam", "lateTeam", "withdraw", "loseJudge", "removeRoom", "renameRoom", "addRoom", "rename"])) {
    case "lateTeam":
      tree.teams[`late${step}`] = { name: `Late ${step}`, submitted: true };
      return "a team submitted late";
    case "withdraw": {
      const id = pick(random, teamIds);
      if (tree.teams[id]) tree.teams[id].submitted = false;
      return `${id} withdrew`;
    }
    case "loseJudge": {
      const id = pick(random, judgeIds);
      if (id) tree.judges[id].isRound1Judge = false;
      return `${id} was unmarked`;
    }
    case "removeRoom":
      if (rooms.length > 1) rooms.splice(Math.floor(random() * rooms.length), 1);
      return "a room was removed";
    case "renameRoom": {
      const i = Math.floor(random() * rooms.length);
      rooms[i] = `${rooms[i]} (renamed ${step})`;
      return "a room was renamed";
    }
    case "addRoom":
      rooms.push(`Annex ${step}`);
      return "a room was added";
    default: {
      const id = pick(random, teamIds);
      if (tree.teams[id]) tree.teams[id].name = `Renamed ${step}`;
      return `${id} was renamed`;
    }
  }
}

/**
 * Work through drift as an organizer would: press every repair, and when the
 * only judge on a panel has to go, swap in somebody free first. Returns null
 * when the drift can only be answered by a rebuild.
 */
function repairAll(plan, drift, live) {
  let next = plan;
  for (const item of drift.blocking) {
    if (item.repair.type === "rebuild") return null;
    let result = applyRepair(next, item.repair);
    if (!result.ok && item.repair.type === "removeJudge") {
      const { teamId, judgeUid } = item.repair;
      const batch = next.assignments[teamId].batch;
      const busy = new Set(
        Object.values(next.assignments).filter((a) => a.batch === batch).flatMap((a) => a.judges.map((j) => j.judgeId))
      );
      const free = live.judgeIds.find((id) => !busy.has(id));
      if (!free) return null;
      const named = { ...next, judgeNames: { ...next.judgeNames, [free]: live.judgeNames[free] } };
      result = applyEdit(named, { type: "swapJudge", teamId, fromUid: judgeUid, toUid: free });
    }
    if (!result.ok) throw new Error(`repair ${JSON.stringify(item.repair)} refused: ${result.error}`);
    next = result.plan;
  }
  return next;
}

describe("changes to the event between Build and Publish, repaired as offered", () => {
  test("after pressing every repair offered, the plan publishes and nothing drifts", async () => {
    const broken = [];
    const tally = { published: 0, rebuild: 0 };

    for (const event of EVENTS.slice(2)) {
      for (let seed = 1; seed <= 60; seed++) {
        const random = seededRandom(seed * 31337 + event.rooms);
        const label = `${event.teams}/${event.judges}/${event.rooms} seed ${seed}`;
        const plan = await built({ ...event, rooms: event.rooms + 3 });

        const tree = db.getData("");
        const changes = [];
        const howMany = 1 + Math.floor(random() * 4);
        for (let i = 0; i < howMany; i++) changes.push(changeTheWorld(random, tree, i));
        db.reset(tree);

        const live = await readLiveBasis(false);
        const drift = checkDrift(plan.basis, live, plan);
        // an organizer presses the repairs in whatever order they like
        drift.blocking.sort(() => random() - 0.5);

        let repaired;
        try {
          repaired = repairAll(plan, drift, live);
        } catch (error) {
          broken.push(`${label} (${changes.join("; ")}): ${error.message}`);
          continue;
        }
        if (!repaired) {
          tally.rebuild += 1;
          continue;
        }
        repaired = fillEmptyPanels(repaired, live.judgeIds);

        const again = checkDrift(repaired.basis, await readLiveBasis(false), repaired);
        if (again.blocking.length) {
          broken.push(`${label} (${changes.join("; ")}): still drifting after repair: ${again.blocking.map((b) => b.message).join(" | ")}`);
          continue;
        }
        for (const p of planViolations(repaired)) broken.push(`${label} (${changes.join("; ")}): ${p}`);

        const published = await publishPlan(repaired);
        if (!published.ok) {
          broken.push(`${label} (${changes.join("; ")}): publish refused: ${published.error}`);
          continue;
        }
        tally.published += 1;
        for (const p of publishedViolations(repaired, db.getData(""))) broken.push(`${label}: ${p}`);
      }
    }
    expect(broken).toEqual([]);
    // the scenario is only worth something if most runs get all the way through
    expect(tally.published).toBeGreaterThan(tally.rebuild);
  }, 180_000);

  test("undoing a placed late team blocks the publish instead of leaving it without a room", async () => {
    const plan = await built({ teams: 6, judges: 18, rooms: 4 });
    db.setData("teams/late/submitted", true);
    db.setData("teams/late/name", "Late");

    const drift = checkDrift(plan.basis, await readLiveBasis(false), plan);
    const placed = applyRepair(plan, drift.blocking[0].repair).plan;
    const unplaced = undoEdit(placed).plan;

    expect(computeStats(unplaced).unscheduledTeamIds).toEqual(["late"]);
    const result = await publishPlan(unplaced);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("1 team(s) have no slot (Late). Place each one before publishing.");
  });
});
