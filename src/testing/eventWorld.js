/**
 * Events of any size, and the rules every schedule has to keep, for the sweep
 * tests.
 *
 * The checks return a list of what is wrong rather than asserting, so a sweep
 * over thousands of events can report every broken one at once, each named by
 * the event that broke it.
 */

/** A seeded generator, so a fuzzed failure can be replayed exactly. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (random, list) => list[Math.floor(random() * list.length)];

/**
 * A database tree for an event.
 *
 * `teams` submitted teams (plus `unsubmitted` that are not), `judges` round-one
 * judges (the first `absent` of them not checked in), `finalOnly` judges not marked
 * for round one, and `rooms` rooms. `min`, `max` and `batches` go to
 * config only when given, so the built-in defaults are what is tested otherwise.
 */
export function eventTree({
  teams = 0,
  unsubmitted = 0,
  judges = 0,
  absent = 0,
  finalOnly = 0,
  rooms = 0,
  batches,
  min,
  max,
  batchTimes,
} = {}) {
  const teamsData = {};
  for (let i = 0; i < teams; i++) {
    teamsData[`t${String(i).padStart(4, "0")}`] = { name: `Team ${i}`, submitted: true };
  }
  for (let i = 0; i < unsubmitted; i++) {
    teamsData[`u${String(i).padStart(4, "0")}`] = { name: `Draft ${i}` };
  }

  const judgesData = {};
  for (let i = 0; i < judges; i++) {
    judgesData[`j${String(i).padStart(4, "0")}`] = {
      firstName: "Judge",
      lastName: String(i),
      isRound1Judge: true,
      checkedIn: i >= absent,
    };
  }
  for (let i = 0; i < finalOnly; i++) {
    judgesData[`f${String(i).padStart(4, "0")}`] = {
      firstName: "Prof",
      lastName: String(i),
      checkedIn: true,
    };
  }

  const config = { judgingRooms: Array.from({ length: rooms }, (_, i) => `Room ${i + 1}`) };
  if (batches !== undefined) config.batchCount = batches;
  if (min !== undefined) config.minJudgesPerTeam = min;
  if (max !== undefined) config.maxJudgesPerTeam = max;
  if (batchTimes !== undefined) config.batchTimes = batchTimes;
  if (!rooms) delete config.judgingRooms;

  return { admins: { "admin-1": true }, config, teams: teamsData, judges: judgesData };
}

/** "120 teams / 90 judges / 40 rooms / 3 batches", to name a broken event. */
export function describeEvent(event) {
  return Object.entries(event)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

/** Batch sizes the planner will use: contiguous, differing by at most one. */
export function batchSizesFor(teams, batches) {
  const base = Math.floor(teams / batches);
  return Array.from({ length: batches }, (_, b) => base + (b < teams % batches ? 1 : 0)).filter(Boolean);
}

/**
 * What any plan, generated or hand edited, must never do.
 *
 * These are the properties that make a schedule physically possible: one team
 * per room per batch, one room per judge per batch, every team placed once.
 */
export function planViolations(plan) {
  const broken = [];
  const { basis = {} } = plan;
  const rooms = new Set(basis.rooms ?? []);
  const assignments = Object.entries(plan.assignments ?? {});

  const placed = new Set();
  const roomInBatch = new Map();
  const judgeInBatch = new Map();

  for (const [key, a] of assignments) {
    if (a.id !== key) broken.push(`assignment under ${key} says it is ${a.id}`);
    placed.add(key);

    if (!Number.isInteger(a.batch) || a.batch < 1 || a.batch > basis.batchCount) {
      broken.push(`${key} is in batch ${a.batch}, outside 1..${basis.batchCount}`);
    }
    if (!rooms.has(a.room)) broken.push(`${key} is in ${a.room}, which is not a configured room`);
    const expectedTime = basis.batchTimes?.[a.batch] ?? "TBD";
    if (a.time !== expectedTime) broken.push(`${key} has time ${a.time}, batch ${a.batch} is ${expectedTime}`);

    const slot = `${a.batch}::${a.room}`;
    if (roomInBatch.has(slot)) broken.push(`${key} and ${roomInBatch.get(slot)} share ${a.room} in batch ${a.batch}`);
    roomInBatch.set(slot, key);

    const onPanel = new Set();
    for (const judge of a.judges ?? []) {
      if (onPanel.has(judge.judgeId)) broken.push(`${judge.judgeId} sits twice on ${key}`);
      onPanel.add(judge.judgeId);
      const where = `${a.batch}::${judge.judgeId}`;
      if (judgeInBatch.has(where)) {
        broken.push(`${judge.judgeId} is in two rooms in batch ${a.batch} (${judgeInBatch.get(where)} and ${key})`);
      }
      judgeInBatch.set(where, key);
      if (!judge.judgeName) broken.push(`${judge.judgeId} on ${key} has no name`);
    }
  }

  for (const id of basis.teamIds ?? []) {
    if (!placed.has(id)) broken.push(`${id} submitted but has no slot`);
  }
  for (const id of placed) {
    if (!(basis.teamIds ?? []).includes(id)) broken.push(`${id} has a slot but is not in the plan's teams`);
  }
  return broken;
}

/**
 * What the generator promises on top of `planViolations`, which a hand edit is
 * free to undo.
 */
export function generatedPlanViolations(plan, { min = 3, max = null, finalOnlyIds = [] } = {}) {
  const broken = planViolations(plan);
  const { basis } = plan;
  const pool = basis.judgeIds;
  const finalOnly = new Set(finalOnlyIds);

  const byBatch = new Map();
  for (const a of Object.values(plan.assignments)) {
    if (!byBatch.has(a.batch)) byBatch.set(a.batch, []);
    byBatch.get(a.batch).push(a);
  }

  const sizes = [...byBatch.keys()].sort((a, b) => a - b).map((b) => byBatch.get(b).length);
  const expected = batchSizesFor(basis.teamIds.length, basis.batchCount);
  if (JSON.stringify(sizes) !== JSON.stringify(expected)) {
    broken.push(`batch sizes ${sizes.join("/")}, expected ${expected.join("/")}`);
  }
  if ([...byBatch.keys()].some((b, i, all) => b !== i + 1 || all.length !== byBatch.size)) {
    broken.push(`batches are not numbered 1..${byBatch.size}`);
  }

  for (const [batch, teams] of byBatch) {
    const panels = teams.map((a) => a.judges.length);
    const smallest = Math.min(...panels);
    const largest = Math.max(...panels);
    if (smallest < 1) broken.push(`a team in batch ${batch} has no judge`);
    if (largest - smallest > 1) broken.push(`batch ${batch} panels range ${smallest}..${largest}`);

    const seated = new Set(teams.flatMap((a) => a.judges.map((j) => j.judgeId)));
    if (max == null) {
      if (seated.size !== pool.length) {
        broken.push(`batch ${batch} seats ${seated.size} of ${pool.length} judges with no cap`);
      }
    } else {
      if (largest > max) broken.push(`batch ${batch} has a panel of ${largest} over the cap of ${max}`);
      if (smallest < max && seated.size < pool.length) {
        broken.push(`batch ${batch} holds judges back while a panel is below the cap`);
      }
    }

    // enough judges for the min in this batch means every panel reaches it
    const reachable = Math.min(max ?? Infinity, Math.floor(pool.length / teams.length));
    if (reachable >= min && smallest < min) {
      broken.push(`batch ${batch} has a panel of ${smallest} though ${pool.length} judges reach ${min}`);
    }
    for (const judgeId of seated) {
      if (finalOnly.has(judgeId)) broken.push(`final-only judge ${judgeId} was seated in round one`);
      if (!pool.includes(judgeId)) broken.push(`${judgeId} was seated but is not in the pool`);
    }
  }
  return broken;
}

/**
 * Does what landed in the database match the plan, from both sides a reader
 * sees it: the team's card and every judge's list.
 */
export function publishedViolations(plan, tree) {
  const broken = [];
  const teams = tree.teams ?? {};
  const judges = tree.judges ?? {};

  for (const [teamId, team] of Object.entries(teams)) {
    const want = plan.assignments[teamId] ?? null;
    const got = team.schedule ?? null;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      broken.push(`teams/${teamId}/schedule does not match the plan`);
    }
  }

  const expectedByJudge = {};
  for (const a of Object.values(plan.assignments)) {
    for (const j of a.judges) (expectedByJudge[j.judgeId] ??= []).push(a.id);
  }

  for (const [judgeId, judge] of Object.entries(judges)) {
    const cards = judge.teamAssignments ?? {};
    const got = Object.keys(cards).sort();
    const want = (expectedByJudge[judgeId] ?? []).sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      broken.push(`judge ${judgeId} has cards for ${got.join(",") || "nothing"}, expected ${want.join(",") || "nothing"}`);
    }
    const batches = Object.values(cards).map((c) => c.batch);
    if (new Set(batches).size !== batches.length) broken.push(`judge ${judgeId} has two cards in one batch`);
    for (const [teamId, card] of Object.entries(cards)) {
      const a = plan.assignments[teamId];
      if (a && (card.room !== a.room || card.batch !== a.batch || card.time !== a.time)) {
        broken.push(`judge ${judgeId}'s card for ${teamId} disagrees with the team's slot`);
      }
    }
  }
  return broken;
}
