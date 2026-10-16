/**
 * The final round, over many event sizes and random score sheets, against an
 * in-memory database: who makes the cut, who judges them, what lands when it
 * is published, and long random editing sessions on the plan.
 *
 * The ranking is worked out again here from the raw cards, independently of
 * scoreRubric, so the two have to agree rather than the code agreeing with
 * itself.
 */
vi.mock("../../firebase.js", () => ({ database: {} }));
vi.mock("firebase/database", async () => (await import("../../testing/fakeDatabase")).module);
vi.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));

const db = await import("../../testing/fakeDatabase");
const { planFinalRound, publishFinalRound, readLiveFinalBasis, rankTeams } = await import("./finalRoundService");
const { applyFinalEdit, undoFinalEdit } = await import("./applyFinalEdit");
const { checkFinalDrift, blockingOnly } = await import("./checkFinalDrift");
const { slotsOf } = await import("./finalRoundPlan");
const { SCORE_FIELDS } = await import("./scoreRubric");
const { seededRandom, pick } = await import("../../testing/eventWorld");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const id = (prefix, i) => `${prefix}${String(i).padStart(4, "0")}`;

/** A random but complete card; `flat` gives every card the same score, to force ties. */
function card(random, flat) {
  const entry = {};
  for (const [field, max] of Object.entries(SCORE_FIELDS)) {
    entry[field] = flat ? Math.ceil(max / 2) : Math.floor(random() * (max + 1));
  }
  entry.fundable = flat ? true : random() < 0.4;
  return entry;
}

/**
 * An event after round one: `teams` submitted teams, a few unsubmitted ones
 * that were scored anyway, `judges` round-one judges (some not checked in),
 * `finalOnly` judges not marked for round one, and each team scored by up to
 * `cardsPerTeam` judges -- or by nobody, for a share of them.
 */
function afterRoundOne({ teams, judges, finalOnly = 0, absent = 0, cardsPerTeam = 3, size, flat = false, seed = 1 }) {
  const random = seededRandom(seed);
  const tree = { admins: { "admin-1": true }, config: {}, teams: {}, judges: {}, scores: { first: {} } };
  if (size !== undefined) tree.config.finalRoundSize = size;

  for (let i = 0; i < judges; i++) {
    tree.judges[id("j", i)] = { firstName: "Judge", lastName: String(i), isRound1Judge: true, checkedIn: i >= absent };
  }
  for (let i = 0; i < finalOnly; i++) {
    tree.judges[id("f", i)] = { firstName: "Prof", lastName: String(i), checkedIn: true };
  }
  tree.judges.away = { firstName: "Never", lastName: "Arrived", isRound1Judge: true, checkedIn: false };

  const judgeIds = Object.keys(tree.judges).filter((uid) => uid.startsWith("j"));
  const addCards = (teamId) => {
    if (!judgeIds.length || random() < 0.15) return; // some teams are never scored
    const n = 1 + Math.floor(random() * cardsPerTeam);
    for (let k = 0; k < n; k++) {
      (tree.scores.first[teamId] ??= {})[pick(random, judgeIds)] = card(random, flat);
    }
  };

  for (let i = 0; i < teams; i++) {
    tree.teams[id("t", i)] = { name: `Team ${i % 7 === 0 ? "Same" : i}`, submitted: true };
    addCards(id("t", i));
  }
  for (let i = 0; i < 3; i++) {
    tree.teams[id("u", i)] = { name: `Withdrawn ${i}` };
    addCards(id("u", i));
  }
  if (!Object.keys(tree.scores.first).length) delete tree.scores;
  return tree;
}

/** The ranking, from the raw cards, without scoreRubric. */
function expectedRanking(tree) {
  const total = (c) => Object.keys(SCORE_FIELDS).reduce((sum, f) => sum + c[f], 0);
  return Object.entries(tree.teams)
    .filter(([teamId, team]) => team.submitted && tree.scores?.first?.[teamId])
    .map(([teamId, team]) => {
      const cards = Object.values(tree.scores.first[teamId]);
      return {
        teamId,
        name: team.name,
        average: cards.reduce((s, c) => s + total(c), 0) / cards.length,
        fundable: cards.filter((c) => c.fundable).length,
        count: cards.length,
      };
    })
    .sort((a, b) =>
      b.average - a.average || b.fundable - a.fundable || b.count - a.count ||
      a.name.localeCompare(b.name, "en") || (a.teamId < b.teamId ? -1 : 1)
    )
    .map((t) => t.teamId);
}

/** Who the build should seat on every panel. */
function expectedPool(tree) {
  const all = Object.entries(tree.judges);
  const here = all.filter(([, j]) => j.checkedIn);
  return (here.length ? here : all.filter(([, j]) => j.isRound1Judge)).map(([uid]) => uid).sort();
}

const SIZES = [];
for (const teams of [1, 2, 3, 4, 5, 9, 30, 120]) {
  for (const judges of [1, 3, 12, 60]) {
    for (const size of [undefined, 1, 2, 4, 10, 500]) {
      SIZES.push({ teams, judges, size, finalOnly: judges > 3 ? 4 : 0, absent: judges > 3 ? 2 : 0 });
    }
  }
}

describe("building the final round", () => {
  test("the cut, the running order and the panels, at every size", async () => {
    const broken = [];
    for (const event of SIZES) {
      for (const seed of [1, 2]) {
        const tree = afterRoundOne({ ...event, seed });
        db.reset(structuredClone(tree));
        const label = `${JSON.stringify(event)} seed ${seed}`;
        const result = await planFinalRound();
        const ranking = expectedRanking(tree);

        if (!ranking.length) {
          if (result.ok) broken.push(`${label}: built a final round with nobody scored`);
          continue;
        }
        if (!result.ok) {
          broken.push(`${label}: refused: ${result.error}`);
          continue;
        }

        const cut = ranking.slice(0, event.size ?? 4);
        const slots = slotsOf(result.plan);
        const got = slots.map((s) => s.teamId);
        if (JSON.stringify(got) !== JSON.stringify(cut)) broken.push(`${label}: cut ${got} expected ${cut}`);
        if (slots.some((s, i) => s.order !== i)) broken.push(`${label}: running order is not 0..n-1`);
        if (got.some((t) => t.startsWith("u"))) broken.push(`${label}: an unsubmitted team made the cut`);

        const pool = expectedPool(tree);
        for (const slot of slots) {
          const panel = slot.judges.map((j) => j.judgeId).sort();
          if (JSON.stringify(panel) !== JSON.stringify(pool)) broken.push(`${label}: ${slot.teamId}'s panel is not the pool`);
        }
        if (result.plan.ranked.map((t) => t.teamId).join() !== ranking.join()) broken.push(`${label}: ranked list differs`);
      }
    }
    expect(broken).toEqual([]);
  }, 120_000);

  test("the ranking does not depend on the order the database lists teams in", () => {
    const broken = [];
    for (let seed = 1; seed <= 40; seed++) {
      const random = seededRandom(seed);
      const tree = afterRoundOne({ teams: 40, judges: 15, seed, flat: seed % 3 === 0 });
      const forwards = rankTeams(tree.teams, tree.scores?.first ?? {}).map((t) => t.teamId);
      const shuffled = Object.fromEntries(Object.entries(tree.teams).sort(() => random() - 0.5));
      const backwards = rankTeams(shuffled, tree.scores?.first ?? {}).map((t) => t.teamId);
      if (forwards.join() !== backwards.join()) broken.push(`seed ${seed}: order changed with listing order`);
    }
    expect(broken).toEqual([]);
  });

  test("when every team ties, the cut is still made and the tie at the line is called out", async () => {
    db.reset(afterRoundOne({ teams: 12, judges: 6, flat: true, cardsPerTeam: 1, seed: 3 }));
    const result = await planFinalRound();
    expect(result.ok).toBe(true);
    expect(slotsOf(result.plan)).toHaveLength(4);
    expect(result.warnings.join(" ")).toMatch(/tied on average/);
  });
});

describe("publishing the final round", () => {
  test("every finalist gets its slot, every panel judge their cards, and nobody else keeps any", async () => {
    const broken = [];
    for (const event of SIZES.filter((_, i) => i % 3 === 0)) {
      const tree = afterRoundOne({ ...event, seed: 5 });
      // a previous activation's leftovers, which publishing has to clear
      tree.teams.t0000.finalSlot = { room: "Old", timeslot: "Slot 9" };
      tree.judges.away.finalAssignments = { gone: { teamId: "gone" } };
      db.reset(tree);
      const label = JSON.stringify(event);

      const built = await planFinalRound();
      if (!built.ok) continue;
      const published = await publishFinalRound(built.plan);
      if (!published.ok) {
        broken.push(`${label}: refused: ${published.error ?? JSON.stringify(published.drift)}`);
        continue;
      }

      const after = db.getData("");
      const slots = slotsOf(built.plan);
      const finalists = new Set(slots.map((s) => s.teamId));
      for (const [teamId, team] of Object.entries(after.teams)) {
        const slot = slots.find((s) => s.teamId === teamId);
        const want = slot ? { room: built.plan.room, timeslot: `Slot ${slot.order + 1}` } : null;
        if (JSON.stringify(team.finalSlot ?? null) !== JSON.stringify(want)) broken.push(`${label}: ${teamId}'s final slot is wrong`);
      }
      for (const [uid, judge] of Object.entries(after.judges)) {
        const want = slots.filter((s) => s.judges.some((j) => j.judgeId === uid)).map((s) => s.teamId).sort();
        const got = Object.keys(judge.finalAssignments ?? {}).sort();
        if (got.join() !== want.join()) broken.push(`${label}: judge ${uid} has final cards for ${got}, expected ${want}`);
      }
      const standings = Object.keys(after.finalRound?.teams ?? {}).sort();
      if (standings.join() !== [...finalists].sort().join()) broken.push(`${label}: standings list the wrong teams`);
      if (after.finalRound?.active !== true) broken.push(`${label}: not marked active`);
    }
    expect(broken).toEqual([]);
  }, 120_000);

  test("a team with no cards at the cut, scored afterwards, stops the publish", async () => {
    const tree = afterRoundOne({ teams: 10, judges: 6, seed: 9 });
    const unscored = Object.keys(tree.teams).find((t) => t.startsWith("t") && !tree.scores.first[t]);
    expect(unscored).toBeDefined();
    db.reset(tree);
    const built = await planFinalRound();

    // a perfect card arrives late -- a judge's queued score finally sending
    const perfect = { ...SCORE_FIELDS, fundable: true };
    db.setData(`scores/first/${unscored}/j0000`, perfect);

    const drift = checkFinalDrift(built.plan, await readLiveFinalBasis());
    expect(blockingOnly(drift).map((d) => d.teamId)).toContain(unscored);
    const published = await publishFinalRound(built.plan);
    expect(published.ok).toBe(false);
  });
});

describe("hundreds of random edits to a final round plan", () => {
  function randomFinalOp(random, plan, everyone) {
    const slots = slotsOf(plan);
    const teamId = pick(random, [...plan.ranked.map((t) => t.teamId), "nobody"]);
    const judge = pick(random, [...everyone, { judgeId: "ghost", judgeName: "" }]);
    switch (pick(random, ["addJudge", "removeJudge", "swapJudge", "moveSlot", "dropTeam", "addTeam", "setRoom"])) {
      case "addJudge":
        return { type: "addJudge", teamId, judgeId: judge.judgeId, judge };
      case "removeJudge":
        return { type: "removeJudge", teamId, judgeId: judge.judgeId };
      case "swapJudge":
        return { type: "swapJudge", teamId, fromJudgeId: judge.judgeId, toJudgeId: pick(random, everyone).judgeId };
      case "moveSlot":
        return { type: "moveSlot", teamId, order: pick(random, [0, 1, slots.length - 1, slots.length, -1, "x"]) };
      case "dropTeam":
        return { type: "dropTeam", teamId };
      case "addTeam":
        return { type: "addTeam", teamId };
      default:
        return { type: "setRoom", room: pick(random, ["Rice 011", "Olsson 120", "", "  "]) };
    }
  }

  function finalViolations(plan) {
    const broken = [];
    const slots = slotsOf(plan);
    if (slots.some((s, i) => s.order !== i)) broken.push(`order is ${slots.map((s) => s.order)}`);
    const ranked = new Set(plan.ranked.map((t) => t.teamId));
    for (const slot of slots) {
      if (!ranked.has(slot.teamId)) broken.push(`${slot.teamId} is a finalist but not ranked`);
      const ids = slot.judges.map((j) => j.judgeId);
      if (new Set(ids).size !== ids.length) broken.push(`${slot.teamId} has a judge twice`);
      if (slot.judges.some((j) => !j.judgeName)) broken.push(`${slot.teamId} has a nameless judge`);
      const pool = new Set(plan.pool.map((j) => j.judgeId));
      if (ids.some((uid) => !pool.has(uid))) broken.push(`${slot.teamId} seats a judge the pool does not know`);
    }
    if (!String(plan.room ?? "").trim()) broken.push("the room is blank");
    return broken;
  }

  for (const event of [
    { teams: 1, judges: 1 },
    { teams: 5, judges: 3, size: 4 },
    { teams: 30, judges: 20, size: 10, finalOnly: 4 },
    { teams: 120, judges: 60, size: 500 },
  ]) {
    test(`${event.teams} teams, ${event.judges} judges, cut of ${event.size ?? 4}`, async () => {
      db.reset(afterRoundOne({ ...event, seed: 11 }));
      const original = (await planFinalRound()).plan;
      const everyone = Object.entries(db.getData("judges")).map(([judgeId, j]) => ({
        judgeId, judgeName: `${j.firstName} ${j.lastName}`,
      }));
      const broken = [];

      for (let seed = 1; seed <= 20 && broken.length < 20; seed++) {
        const random = seededRandom(seed);
        let plan = original;
        for (let step = 0; step < 150; step++) {
          if (random() < 0.15) {
            plan = undoFinalEdit(plan) ?? plan;
          } else {
            const before = JSON.stringify(plan);
            const op = randomFinalOp(random, plan, everyone);
            const result = applyFinalEdit(plan, op);
            if (JSON.stringify(plan) !== before) broken.push(`seed ${seed} step ${step}: ${op.type} mutated its input`);
            if (result.ok) plan = result.plan;
            else if (!result.error) broken.push(`seed ${seed} step ${step}: ${op.type} refused with no reason`);
          }
          for (const p of finalViolations(plan)) broken.push(`seed ${seed} step ${step}: ${p}`);
        }
        let unwound = plan;
        while (unwound.edits.length) unwound = undoFinalEdit(unwound);
        const shape = (p) => JSON.stringify([p.room, slotsOf(p).map((s) => [s.teamId, s.judges.map((j) => j.judgeId)])]);
        if (shape(unwound) !== shape(original)) broken.push(`seed ${seed}: undoing every edit did not return to the build`);
      }
      expect(broken).toEqual([]);
    }, 60_000);
  }
});
