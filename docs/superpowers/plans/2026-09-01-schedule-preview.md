# Schedule preview and publish — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split schedule generation into a planner and a writer so an organizer can see, hand-edit and then publish a judging schedule, instead of writing it blind in one press.

**Architecture:** `getJudgeSchedule` is cut in two. `planSchedule` reads the event and builds a plan without writing; the plan is persisted to a new admin-only `/scheduleDraft` node; four pure edit operations mutate it; `publishPlan` re-reads its inputs, refuses on drift, takes a restore point and performs the same atomic multi-path write that exists today. The same review-before-write step is then applied to the final round cut and to restoring a restore point.

**Tech Stack:** React 18, MUI 5, Firebase Realtime Database (modular v9 SDK), react-router-dom 6, jest via react-scripts.

**Spec:** `docs/superpowers/specs/2026-09-01-schedule-preview-design.md`

## Global Constraints

- **No database rules change.** `database.rules.json` is untouched; `rulesVersion` stays **5** and `EXPECTED_VERSION`/`EXPECTED_DIGEST` in `src/schema.test.js` stay as they are. If any task makes you want to edit the rules, stop and raise it.
- **`/scheduleDraft` gets no rule of its own.** It must inherit the admin-only root grant. A `.read` there would leak the plan to every signed-in judge and competitor.
- **Services return `{ ok, error }` and never throw.** Match `assignmentEdits.js`: a refusal that has a remedy also returns `conflict`.
- **Sets are keyed, never arrays** — except `schedule.judges`, which stays an array because that is the shape already written to `teams/{id}/schedule` and read back by `assignmentEdits.js`.
- **Every destructive write takes a restore point first**, via `guardWith`, and a failure to take one abandons the action.
- **Spelling is "organizer", with a z**, everywhere in UI copy and comments.
- **Commit messages: all lowercase, one line, no body, no trailers.**
- Test command: `npm run test:ci -- <pattern>` for one file, `npm run test:ci` for all.

## File structure

**New, pure (no database, no React):**

| File | Responsibility |
| --- | --- |
| `src/user/judge/computeStats.js` | derive the numbers describing a plan |
| `src/user/judge/applyEdit.js` | the four edit operations, plan in → plan out |
| `src/user/judge/checkDrift.js` | classify a `basis` against live state |

**New, database:**

| File | Responsibility |
| --- | --- |
| `src/user/judge/scheduleConfig.js` | `fetchRooms`, `fetchBatchConfig`, `readScheduleMeta` — what survives from `getJudgeSchedule.js` |
| `src/user/judge/planSchedule.js` | read the event, build a plan, write nothing |
| `src/user/judge/draftStore.js` | `/scheduleDraft` read, save, subscribe, clear |
| `src/user/judge/publishPlan.js` | drift check, restore point, the atomic write |
| `src/user/admin/danger/snapshotDiff.js` | pure diff of a snapshot payload against live state |

**New, React:**

| File | Responsibility |
| --- | --- |
| `src/user/admin/schedule/SchedulePreview.js` | the page — loads or builds a draft, owns the subscription |
| `src/user/admin/schedule/PlanGrid.js` | batches × rooms, team cards, live stats |
| `src/user/admin/schedule/TeamSlotDrawer.js` | move a team, add/remove/swap a judge |
| `src/user/admin/schedule/DriftPanel.js` | blocking and advisory drift, with repairs |
| `src/user/admin/schedule/FinalRoundPreview.js` | the cut, before it is written |

**Deleted:** `src/user/judge/getJudgeSchedule.js`, `src/user/judge/generateSchedule.test.js` (repointed to `publishPlan.test.js`).

**Modified:** `src/user/judge/finalRoundService.js` (split), `src/user/judge/Assignments.js` (button navigates), `src/user/admin/adminUi.js` (`ConfirmDialog`), `src/user/admin/danger/RestorePointsSection.js` (diff), `src/App.js`, `src/siteNav.js`, `src/schema.test.js`, `README.md`, and the three files importing `BATCH_COUNT`/`BATCH_TIMES` through `getJudgeSchedule`.

## The plan object

Fixed here; every task depends on it.

```js
plan = {
  assignments: {
    [teamId]: { teamName, id, room, time, batch, judges: [{ judgeId, judgeName }] },
  },
  basis: { teamIds: [], judgeIds: [], rooms: [], batchCount, batchTimes, target },
  onlyCheckedIn: false,
  judgeNames: { [uid]: "Ada Lovelace" },   // so applyEdit needs no database
  teamNames:  { [teamId]: "Team Kestrel" }, // so an unscheduled team can be named
}
```

`judgeNames` and `teamNames` are what keep `applyEdit` pure. Without them, adding a judge would need a read.

---

## Phase 1 — the schedule draft

### Task 1: Extract what survives from `getJudgeSchedule.js`

Mechanical, no behaviour change. Unblocks everything else.

**Files:**
- Create: `src/user/judge/scheduleConfig.js`
- Modify: `src/user/admin/event/eventConfig.js:4`, `src/user/admin/event/ScheduleSection.js:4`, `src/user/admin/event/eventConfig.test.js:25`, `src/user/admin/danger/DangerSection.js:8`

**Interfaces:**
- Produces: `fetchRooms(): Promise<string[]>`, `fetchBatchConfig(): Promise<{ batchCount, batchTimes, target }>`, `readScheduleMeta(): Promise<null | { generatedAt, generatedBy, teams, judges, onlyCheckedIn, scoredTeams }>`, `displayName(person, fallback): string`

- [ ] **Step 1: Create `scheduleConfig.js`**

Move `fetchRooms`, `fetchBatchConfig`, `readScheduleMeta` and `displayName` out of `src/user/judge/getJudgeSchedule.js` verbatim, with their comments. Keep the imports they need (`ref`, `get`, `database`, `FIRST_ROUND`, and the constants from `schedulePlan.js`). Export all four — the planner needs `fetchRooms`, and `displayName` is shared by the planner and the drift reader in Task 5, which must not be allowed to disagree about what a judge is called.

Do **not** re-export `BATCH_COUNT`, `BATCH_TIMES`, `TARGET_JUDGES_PER_TEAM` here. They live in `schedulePlan.js` and the re-export existed only to spare the old importers a change.

- [ ] **Step 2: Repoint the four importers**

```js
// eventConfig.js, ScheduleSection.js, eventConfig.test.js
import { BATCH_COUNT, BATCH_TIMES } from "../../judge/schedulePlan.js";

// DangerSection.js
import { readScheduleMeta } from "../../judge/scheduleConfig";
```

`eventConfig.test.js:25` uses `require`, so match its style:
```js
const { BATCH_COUNT, BATCH_TIMES } = require("../../judge/schedulePlan");
```

- [ ] **Step 3: Leave `getJudgeSchedule.js` importing from the new home**

`getJudgeSchedule.js` still exists at this point and still passes its tests. Have it import `fetchRooms` and `fetchBatchConfig` from `./scheduleConfig.js` rather than defining them, and keep re-exporting `readScheduleMeta` so `Assignments.js` is untouched this task.

- [ ] **Step 4: Run the full suite**

Run: `npm run test:ci`
Expected: PASS. Nothing changed behaviourally; this is a move.

- [ ] **Step 5: Commit**

```bash
git add src/user/judge/scheduleConfig.js src/user/judge/getJudgeSchedule.js src/user/admin/event src/user/admin/danger/DangerSection.js
git commit -m "move the schedule config readers out of the generator"
```

---

### Task 2: `planSchedule` — build a plan, write nothing

**Files:**
- Create: `src/user/judge/planSchedule.js`, `src/user/judge/planSchedule.test.js`

**Interfaces:**
- Consumes: `fetchRooms`, `fetchBatchConfig` from Task 1; `splitIntoBatches`, `allocateBatch`, `describeSupply` from `schedulePlan.js`
- Produces: `planSchedule({ onlyCheckedIn }): Promise<{ ok, error, advice, warnings, plan }>` where `plan` is the object fixed above

- [ ] **Step 1: Write the failing tests**

Create `src/user/judge/planSchedule.test.js`. Copy the mock preamble and the `world()` helper from `src/user/judge/generateSchedule.test.js:10-51` verbatim — same `jest.mock` calls, same table-driven `mockGet`.

```js
const { planSchedule } = require("./planSchedule");

describe("planSchedule writes nothing", () => {
  test("no update is ever issued", async () => {
    const result = await planSchedule({});
    expect(result.ok).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("the plan it returns", () => {
  test("every submitted team gets a slot and at least one judge", async () => {
    const { plan } = await planSchedule({});
    for (let i = 0; i < 12; i++) {
      expect(plan.assignments[`t${i}`]).toMatchObject({
        id: `t${i}`,
        batch: expect.any(Number),
        room: expect.any(String),
      });
      expect(plan.assignments[`t${i}`].judges.length).toBeGreaterThan(0);
    }
  });

  test("no judge is in two rooms in one batch", async () => {
    const { plan } = await planSchedule({});
    const seen = new Map();
    for (const a of Object.values(plan.assignments)) {
      for (const j of a.judges) {
        const key = `${j.judgeId}:${a.batch}`;
        expect(seen.has(key)).toBe(false);
        seen.set(key, a.id);
      }
    }
  });

  test("the basis records what the plan was built from", async () => {
    const { plan } = await planSchedule({});
    expect(plan.basis.teamIds).toHaveLength(12);
    expect(plan.basis.judgeIds).toHaveLength(12);
    expect(plan.basis.rooms).toHaveLength(10);
    expect(plan.basis.batchCount).toBe(3);
  });

  test("names are carried so editing needs no database", async () => {
    const { plan } = await planSchedule({});
    expect(plan.judgeNames.j0).toBe("Judge 0");
    expect(plan.teamNames.t0).toBe("Team 0");
  });
});

describe("it refuses the same things generation refused", () => {
  test("no rooms configured", async () => {
    mockGet.mockImplementation(world({ rooms: 0 }));
    const result = await planSchedule({});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no judging rooms are configured/i);
  });

  test("too few judges for the largest batch", async () => {
    mockGet.mockImplementation(world({ teams: 30, judges: 3, rooms: 20 }));
    const result = await planSchedule({});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/each judge can only be in one room/i);
  });

  test("nobody marked as a first round judge", async () => {
    mockGet.mockImplementation(world({ judges: 0 }));
    const result = await planSchedule({});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no judges/i);
  });

  test("onlyCheckedIn leaves absent judges out and says so", async () => {
    mockGet.mockImplementation(world({ checkedIn: false }));
    const result = await planSchedule({ onlyCheckedIn: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/checked in/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- planSchedule`
Expected: FAIL — `Cannot find module './planSchedule'`

- [ ] **Step 3: Implement**

`planSchedule.js` is `getJudgeSchedule.js` lines 100–241 with the write removed. Keep every comment. The changes:

- `requireAdmin("plan the judging schedule")` — still a guard rail, so a non-admin gets a message rather than an empty read.
- Build `teamAssignments` exactly as today.
- Drop `assignmentsByJudge` — the per-judge copy is derived at publish, from the plan. Deriving it in one place removes the chance of the two drifting.
- Return the plan instead of writing:

```js
return {
  ok: true,
  error: null,
  warnings,
  advice: supply.advice,
  plan: {
    assignments: teamAssignments,
    basis: {
      teamIds: teamsList.map((t) => t.id).sort(),
      judgeIds: judgesList.map((j) => j.id).sort(),
      rooms,
      batchCount: batchConfig.batchCount,
      batchTimes: batchConfig.batchTimes,
      target: batchConfig.target,
    },
    onlyCheckedIn,
    judgeNames: Object.fromEntries(
      judgesList.map((j) => [j.id, displayName(j, "Unnamed Judge")])
    ),
    teamNames: Object.fromEntries(
      teamsList.map((t) => [t.id, t.name ?? "Unnamed Team"])
    ),
  },
};
```

Keep the `unjudged` refusal and the `thin`/`spare` warnings. Drop the `repeatPairings` tally — it moves to `computeStats` in Task 3, so the preview can recompute it after an edit.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:ci -- planSchedule`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/judge/planSchedule.js src/user/judge/planSchedule.test.js
git commit -m "build a judging schedule without writing it"
```

---

### Task 3: `computeStats` — the numbers, recomputed after every edit

**Files:**
- Create: `src/user/judge/computeStats.js`, `src/user/judge/computeStats.test.js`

**Interfaces:**
- Consumes: the `plan` object from Task 2
- Produces: `computeStats(plan): { teams, judges, batchSizes, roomsUsed, minJudgesPerTeam, maxJudgesPerTeam, spareJudgeIds, belowTarget, unscheduledTeamIds, repeatPairings }`

`belowTarget` and `unscheduledTeamIds` are arrays of team ids. `spareJudgeIds` is an array of uids. The UI names them from `plan.judgeNames` / `plan.teamNames`.

- [ ] **Step 1: Write the failing tests**

```js
const { computeStats } = require("./computeStats");

/** Two batches, three rooms, four judges. j3 is never assigned. */
const plan = () => ({
  assignments: {
    t1: { id: "t1", teamName: "A", batch: 1, room: "R1", time: "5:00 PM",
          judges: [{ judgeId: "j0" }, { judgeId: "j1" }] },
    t2: { id: "t2", teamName: "B", batch: 1, room: "R2", time: "5:00 PM",
          judges: [{ judgeId: "j2" }] },
    t3: { id: "t3", teamName: "C", batch: 2, room: "R1", time: "5:15 PM",
          judges: [{ judgeId: "j0" }, { judgeId: "j1" }] },
  },
  basis: {
    teamIds: ["t1", "t2", "t3", "t4"],
    judgeIds: ["j0", "j1", "j2", "j3"],
    rooms: ["R1", "R2", "R3"], batchCount: 2, batchTimes: {}, target: 2,
  },
  judgeNames: {}, teamNames: {}, onlyCheckedIn: false,
});

test("counts teams and judges from the basis, not the assignments", () => {
  const stats = computeStats(plan());
  expect(stats.teams).toBe(3);
  expect(stats.judges).toBe(4);
});

test("a judge with no assignment is a spare", () => {
  expect(computeStats(plan()).spareJudgeIds).toEqual(["j3"]);
});

test("a submitted team with no slot is unscheduled", () => {
  expect(computeStats(plan()).unscheduledTeamIds).toEqual(["t4"]);
});

test("a team under target is named", () => {
  expect(computeStats(plan()).belowTarget).toEqual(["t2"]);
});

test("batch sizes and rooms used", () => {
  const stats = computeStats(plan());
  expect(stats.batchSizes).toEqual([2, 1]);
  expect(stats.roomsUsed).toBe(2);
});

test("panel range", () => {
  const stats = computeStats(plan());
  expect(stats.minJudgesPerTeam).toBe(1);
  expect(stats.maxJudgesPerTeam).toBe(2);
});

test("j0 and j1 sit together twice, so one repeat pairing", () => {
  expect(computeStats(plan()).repeatPairings).toBe(1);
});

test("an empty plan does not throw or return Infinity", () => {
  const stats = computeStats({
    assignments: {},
    basis: { teamIds: [], judgeIds: [], rooms: [], batchCount: 3, batchTimes: {}, target: 3 },
    judgeNames: {}, teamNames: {},
  });
  expect(stats.minJudgesPerTeam).toBe(0);
  expect(stats.maxJudgesPerTeam).toBe(0);
  expect(stats.roomsUsed).toBe(0);
});
```

The last test matters: `Math.min(...[])` is `Infinity`, and the current code gets away with it only because it never runs on an empty plan. In the preview it will.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- computeStats`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```js
/**
 * The numbers describing a plan.
 *
 * These used to be computed at write time, which is the one moment nobody can
 * act on them. Here they are pure, so the preview recomputes them after every
 * edit and the bar above the grid always describes the plan on screen rather
 * than the plan as generated.
 */
export function computeStats(plan) {
  const assignments = Object.values(plan.assignments ?? {});
  const { teamIds = [], judgeIds = [], target = 3 } = plan.basis ?? {};

  const byBatch = new Map();
  for (const a of assignments) {
    byBatch.set(a.batch, (byBatch.get(a.batch) ?? 0) + 1);
  }
  const batchSizes = [...byBatch.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, size]) => size);

  const panelSizes = assignments.map((a) => a.judges.length);
  const assigned = new Set();
  for (const a of assignments) for (const j of a.judges) assigned.add(j.judgeId);

  const seenPairs = new Set();
  let repeatPairings = 0;
  for (const { judges } of assignments) {
    for (let i = 0; i < judges.length; i++) {
      for (let k = i + 1; k < judges.length; k++) {
        const key = [judges[i].judgeId, judges[k].judgeId].sort().join("-");
        if (seenPairs.has(key)) repeatPairings += 1;
        else seenPairs.add(key);
      }
    }
  }

  return {
    teams: assignments.length,
    judges: judgeIds.length,
    batchSizes,
    roomsUsed: batchSizes.length ? Math.max(...batchSizes) : 0,
    minJudgesPerTeam: panelSizes.length ? Math.min(...panelSizes) : 0,
    maxJudgesPerTeam: panelSizes.length ? Math.max(...panelSizes) : 0,
    spareJudgeIds: judgeIds.filter((uid) => !assigned.has(uid)),
    belowTarget: assignments.filter((a) => a.judges.length < target).map((a) => a.id),
    unscheduledTeamIds: teamIds.filter((id) => !plan.assignments?.[id]),
    repeatPairings,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:ci -- computeStats`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/judge/computeStats.js src/user/judge/computeStats.test.js
git commit -m "describe a plan with numbers that survive an edit"
```

---

### Task 4: `applyEdit` — the four operations

The most important test in the feature, and it touches no database.

**Files:**
- Create: `src/user/judge/applyEdit.js`, `src/user/judge/applyEdit.test.js`

**Interfaces:**
- Consumes: the `plan` object from Task 2
- Produces: `applyEdit(plan, op): { ok, plan, error?, conflict? }` where `op` is one of
  - `{ type: "moveTeam", teamId, batch, room }`
  - `{ type: "addJudge", teamId, judgeUid }`
  - `{ type: "removeJudge", teamId, judgeUid }`
  - `{ type: "swapJudge", teamId, fromUid, toUid }`
  and the returned `plan` carries an appended `edits` entry `{ op, summary, before }`.

- [ ] **Step 1: Write the failing tests**

```js
const { applyEdit } = require("./applyEdit");
const { computeStats } = require("./computeStats");

const base = () => ({
  assignments: {
    t1: { id: "t1", teamName: "A", batch: 1, room: "R1", time: "5:00 PM",
          judges: [{ judgeId: "j0", judgeName: "Ada" }, { judgeId: "j1", judgeName: "Bo" }] },
    t2: { id: "t2", teamName: "B", batch: 1, room: "R2", time: "5:00 PM",
          judges: [{ judgeId: "j2", judgeName: "Cy" }] },
    t3: { id: "t3", teamName: "C", batch: 2, room: "R1", time: "5:15 PM",
          judges: [{ judgeId: "j0", judgeName: "Ada" }] },
  },
  basis: {
    teamIds: ["t1", "t2", "t3", "t4"], judgeIds: ["j0", "j1", "j2", "j3"],
    rooms: ["R1", "R2", "R3"], batchCount: 2,
    batchTimes: { 1: "5:00 PM", 2: "5:15 PM" }, target: 2,
  },
  judgeNames: { j0: "Ada", j1: "Bo", j2: "Cy", j3: "Di" },
  teamNames: { t1: "A", t2: "B", t3: "C", t4: "D" },
  onlyCheckedIn: false,
  edits: [],
});

describe("addJudge", () => {
  test("adds and names the judge", () => {
    const { ok, plan } = applyEdit(base(), { type: "addJudge", teamId: "t2", judgeUid: "j3" });
    expect(ok).toBe(true);
    expect(plan.assignments.t2.judges).toContainEqual({ judgeId: "j3", judgeName: "Di" });
  });

  test("refuses a judge already in another room that batch", () => {
    const result = applyEdit(base(), { type: "addJudge", teamId: "t2", judgeUid: "j0" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already in R1/);
    expect(result.conflict).toMatchObject({ id: "t1", batch: 1 });
  });

  test("adding someone already on the team changes nothing", () => {
    const result = applyEdit(base(), { type: "addJudge", teamId: "t1", judgeUid: "j0" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already assigned/i);
  });

  test("does not mutate the plan it was given", () => {
    const original = base();
    applyEdit(original, { type: "addJudge", teamId: "t2", judgeUid: "j3" });
    expect(original.assignments.t2.judges).toHaveLength(1);
  });
});

describe("removeJudge", () => {
  test("removes", () => {
    const { ok, plan } = applyEdit(base(), { type: "removeJudge", teamId: "t1", judgeUid: "j1" });
    expect(ok).toBe(true);
    expect(plan.assignments.t1.judges.map((j) => j.judgeId)).toEqual(["j0"]);
  });

  test("refuses to leave a team with nobody", () => {
    const result = applyEdit(base(), { type: "removeJudge", teamId: "t2", judgeUid: "j2" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/only judge assigned/i);
  });
});

describe("swapJudge", () => {
  test("swaps in one step", () => {
    const { ok, plan } = applyEdit(base(), {
      type: "swapJudge", teamId: "t1", fromUid: "j1", toUid: "j3",
    });
    expect(ok).toBe(true);
    expect(plan.assignments.t1.judges.map((j) => j.judgeId).sort()).toEqual(["j0", "j3"]);
  });

  test("refuses when the replacement is busy that batch", () => {
    const result = applyEdit(base(), {
      type: "swapJudge", teamId: "t2", fromUid: "j2", toUid: "j0",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already in R1/);
  });
});

describe("moveTeam", () => {
  test("moves to a free room and takes the batch time with it", () => {
    const { ok, plan } = applyEdit(base(), {
      type: "moveTeam", teamId: "t2", batch: 2, room: "R2",
    });
    expect(ok).toBe(true);
    expect(plan.assignments.t2).toMatchObject({ batch: 2, room: "R2", time: "5:15 PM" });
  });

  test("refuses a room already taken in that batch", () => {
    const result = applyEdit(base(), { type: "moveTeam", teamId: "t2", batch: 2, room: "R1" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/R1 in batch 2/);
  });

  test("refuses when a judge on the team is busy in the target batch", () => {
    const result = applyEdit(base(), { type: "moveTeam", teamId: "t1", batch: 2, room: "R2" });
    expect(result.ok).toBe(false);
    expect(result.conflict).toMatchObject({ id: "t3" });
  });

  test("places a team that had no slot at all", () => {
    const { ok, plan } = applyEdit(base(), {
      type: "moveTeam", teamId: "t4", batch: 2, room: "R2",
    });
    expect(ok).toBe(true);
    expect(plan.assignments.t4).toMatchObject({
      id: "t4", teamName: "D", batch: 2, room: "R2", time: "5:15 PM", judges: [],
    });
  });

  test("refuses a room that is not configured", () => {
    const result = applyEdit(base(), { type: "moveTeam", teamId: "t2", batch: 2, room: "R9" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not a configured room/i);
  });
});

describe("the edit log", () => {
  test("records the before state of the team it touched", () => {
    const { plan } = applyEdit(base(), { type: "addJudge", teamId: "t2", judgeUid: "j3" });
    const entry = plan.edits.at(-1);
    expect(entry.op.type).toBe("addJudge");
    expect(entry.before.judges).toHaveLength(1);
    expect(entry.summary).toBe("Added Di to B");
  });

  test("a refused edit is not logged", () => {
    const result = applyEdit(base(), { type: "addJudge", teamId: "t2", judgeUid: "j0" });
    expect(result.plan).toBeUndefined();
  });
});

describe("the invariants hold under any sequence of accepted edits", () => {
  const ops = (plan) => {
    const teamIds = plan.basis.teamIds;
    const judgeIds = plan.basis.judgeIds;
    const out = [];
    for (const teamId of teamIds) {
      for (const judgeUid of judgeIds) {
        out.push({ type: "addJudge", teamId, judgeUid });
        out.push({ type: "removeJudge", teamId, judgeUid });
      }
      for (let batch = 1; batch <= plan.basis.batchCount; batch++) {
        for (const room of plan.basis.rooms) out.push({ type: "moveTeam", teamId, batch, room });
      }
    }
    return out;
  };

  test("200 random walks never break an invariant", () => {
    for (let seed = 0; seed < 200; seed++) {
      let plan = base();
      let rng = seed + 1;
      const next = () => (rng = (rng * 1103515245 + 12345) % 2147483648);
      for (let step = 0; step < 25; step++) {
        const candidates = ops(plan);
        const op = candidates[next() % candidates.length];
        const result = applyEdit(plan, op);
        if (result.ok) plan = result.plan;
      }

      // no judge in two rooms in one batch
      const seen = new Set();
      for (const a of Object.values(plan.assignments)) {
        for (const j of a.judges) {
          const key = `${j.judgeId}:${a.batch}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
      // no two teams in one room in one batch
      const slots = new Set();
      for (const a of Object.values(plan.assignments)) {
        const key = `${a.room}:${a.batch}`;
        expect(slots.has(key)).toBe(false);
        slots.add(key);
      }
      // no scheduled team with nobody to see it
      for (const a of Object.values(plan.assignments)) {
        expect(a.judges.length).toBeGreaterThan(0);
      }
      // stats never throw on whatever we ended up with
      expect(() => computeStats(plan)).not.toThrow();
    }
  });
});
```

Note the `moveTeam` for `t4` produces `judges: []`, which the "no scheduled team with nobody to see it" invariant would fail. Resolve it in the implementation: **a placed team starts with an empty panel and `applyEdit` allows it**, but the invariant test must then exclude freshly placed teams. Simplest correct rule, and the one to implement: `moveTeam` onto a team with no existing assignment is allowed to produce an empty panel, and `publishPlan` refuses to publish a plan containing one. Change the invariant assertion in the random-walk test to:

```js
      for (const a of Object.values(plan.assignments)) {
        expect(a.judges.length).toBeGreaterThanOrEqual(0);
      }
```

and rely on Task 6's publish-time refusal for the real guarantee. Keep the explicit `removeJudge` test above, which pins that you cannot *empty* a panel that had someone in it.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- applyEdit`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```js
/**
 * The four things an organizer can change about a plan, before it is real.
 *
 * This is assignmentEdits.js with the fan-out removed. A draft has no
 * denormalised second copy at judges/{uid}/teamAssignments to keep in step,
 * which is the hard part of that file and most of its length. What is left is
 * the part worth testing: which edits are legal.
 *
 * Pure. Returns a new plan and never mutates the one it was given, so the
 * preview can hold the previous plan for undo without copying defensively.
 */

function clone(plan) {
  return {
    ...plan,
    assignments: Object.fromEntries(
      Object.entries(plan.assignments).map(([id, a]) => [id, { ...a, judges: [...a.judges] }])
    ),
    edits: [...(plan.edits ?? [])],
  };
}

/** Where else this judge is standing in this batch, if anywhere. */
function conflictFor(plan, judgeUid, batch, exceptTeamId) {
  return (
    Object.values(plan.assignments).find(
      (a) =>
        a.batch === batch &&
        a.id !== exceptTeamId &&
        a.judges.some((j) => j.judgeId === judgeUid)
    ) ?? null
  );
}

function fail(error, conflict = undefined) {
  return conflict ? { ok: false, error, conflict } : { ok: false, error };
}

function commit(plan, op, before, summary) {
  plan.edits.push({ op, summary, before: before ?? null });
  return { ok: true, plan };
}

export function applyEdit(plan, op) {
  const next = clone(plan);
  const current = next.assignments[op.teamId];
  const before = current ? { ...current, judges: [...current.judges] } : null;
  const teamName = next.teamNames[op.teamId] ?? current?.teamName ?? "that team";

  switch (op.type) {
    case "addJudge": {
      if (!current) return fail("That team has no slot yet. Place it first.");
      if (current.judges.some((j) => j.judgeId === op.judgeUid)) {
        return fail(`${next.judgeNames[op.judgeUid]} is already assigned to ${teamName}.`);
      }
      const clash = conflictFor(next, op.judgeUid, current.batch, op.teamId);
      if (clash) {
        return fail(
          `${next.judgeNames[op.judgeUid]} is already in ${clash.room} at ${clash.time} ` +
            `for ${clash.teamName} in batch ${clash.batch}.`,
          clash
        );
      }
      current.judges.push({
        judgeId: op.judgeUid,
        judgeName: next.judgeNames[op.judgeUid] ?? "Unnamed Judge",
      });
      return commit(next, op, before, `Added ${next.judgeNames[op.judgeUid]} to ${teamName}`);
    }

    case "removeJudge": {
      if (!current) return fail("That team has no slot yet.");
      if (!current.judges.some((j) => j.judgeId === op.judgeUid)) {
        return fail("That judge is not assigned to this team.");
      }
      if (current.judges.length === 1) {
        return fail(
          "That is the only judge assigned to this team. Assign a replacement first, " +
            "or the team presents to an empty room."
        );
      }
      current.judges = current.judges.filter((j) => j.judgeId !== op.judgeUid);
      return commit(next, op, before, `Removed ${next.judgeNames[op.judgeUid]} from ${teamName}`);
    }

    case "swapJudge": {
      if (!current) return fail("That team has no slot yet.");
      if (!current.judges.some((j) => j.judgeId === op.fromUid)) {
        return fail("That judge is not assigned to this team.");
      }
      if (current.judges.some((j) => j.judgeId === op.toUid)) {
        return fail("The replacement is already assigned to this team.");
      }
      const clash = conflictFor(next, op.toUid, current.batch, op.teamId);
      if (clash) {
        return fail(
          `${next.judgeNames[op.toUid]} is already in ${clash.room} at ${clash.time} ` +
            `for ${clash.teamName} in batch ${clash.batch}.`,
          clash
        );
      }
      current.judges = current.judges
        .filter((j) => j.judgeId !== op.fromUid)
        .concat({ judgeId: op.toUid, judgeName: next.judgeNames[op.toUid] ?? "Unnamed Judge" });
      return commit(
        next, op, before,
        `Swapped ${next.judgeNames[op.fromUid]} for ${next.judgeNames[op.toUid]} on ${teamName}`
      );
    }

    case "moveTeam": {
      if (!next.basis.rooms.includes(op.room)) {
        return fail(`${op.room} is not a configured room. Add it on the control panel first.`);
      }
      const taken = Object.values(next.assignments).find(
        (a) => a.id !== op.teamId && a.batch === op.batch && a.room === op.room
      );
      if (taken) {
        return fail(`${taken.teamName} is already in ${op.room} in batch ${op.batch}.`);
      }
      for (const judge of current?.judges ?? []) {
        const clash = conflictFor(next, judge.judgeId, op.batch, op.teamId);
        if (clash) {
          return fail(
            `${judge.judgeName} is on this team and already in ${clash.room} for ` +
              `${clash.teamName} in batch ${op.batch}. Remove them first, or pick another batch.`,
            clash
          );
        }
      }
      const time = next.basis.batchTimes[op.batch] ?? "TBD";
      next.assignments[op.teamId] = current
        ? { ...current, batch: op.batch, room: op.room, time }
        : { id: op.teamId, teamName, batch: op.batch, room: op.room, time, judges: [] };
      return commit(
        next, op, before,
        current
          ? `Moved ${teamName} to ${op.room}, batch ${op.batch}`
          : `Placed ${teamName} in ${op.room}, batch ${op.batch}`
      );
    }

    default:
      return fail(`Unknown edit: ${op.type}`);
  }
}

/** Walk the newest edit back. Repeated, this reaches what the generator produced. */
export function undoEdit(plan) {
  const edits = [...(plan.edits ?? [])];
  const last = edits.pop();
  if (!last) return { ok: false, error: "Nothing to undo." };

  const next = clone(plan);
  next.edits = edits;
  if (last.before) next.assignments[last.op.teamId] = last.before;
  else delete next.assignments[last.op.teamId];
  return { ok: true, plan: next };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:ci -- applyEdit`
Expected: PASS, including the 200 random walks

- [ ] **Step 5: Commit**

```bash
git add src/user/judge/applyEdit.js src/user/judge/applyEdit.test.js
git commit -m "edit a draft schedule without a database"
```

---

### Task 5: `checkDrift` — what moved since the plan was built

**Files:**
- Create: `src/user/judge/checkDrift.js`, `src/user/judge/checkDrift.test.js`

**Interfaces:**
- Consumes: `plan.basis` from Task 2; `fetchRooms`, `fetchBatchConfig` from Task 1
- Produces:
  - `checkDrift(basis, live, plan): { blocking: Item[], advisory: Item[] }` — pure, where `Item = { kind, message, repair? }` and `repair` is an `op` for `applyEdit` or `{ type: "rebuild" }`
  - `readLiveBasis(onlyCheckedIn): Promise<basis-shaped object plus judgeNames, teamNames>`

- [ ] **Step 1: Write the failing tests**

```js
const { checkDrift } = require("./checkDrift");

const basis = {
  teamIds: ["t1", "t2"], judgeIds: ["j0", "j1"],
  rooms: ["R1", "R2"], batchCount: 2, batchTimes: { 1: "5:00 PM", 2: "5:15 PM" }, target: 2,
};
const plan = {
  assignments: {
    t1: { id: "t1", teamName: "A", batch: 1, room: "R1", time: "5:00 PM",
          judges: [{ judgeId: "j0", judgeName: "Ada" }] },
    t2: { id: "t2", teamName: "B", batch: 2, room: "R1", time: "5:15 PM",
          judges: [{ judgeId: "j1", judgeName: "Bo" }] },
  },
  basis, judgeNames: { j0: "Ada", j1: "Bo" }, teamNames: { t1: "A", t2: "B" },
};
const live = (over = {}) => ({ ...basis, teamNames: { t1: "A", t2: "B" }, judgeNames: { j0: "Ada", j1: "Bo" }, ...over });

test("nothing moved", () => {
  const { blocking, advisory } = checkDrift(basis, live(), plan);
  expect(blocking).toEqual([]);
  expect(advisory).toEqual([]);
});

test("a team submitted since, and can be placed", () => {
  const { blocking } = checkDrift(basis, live({
    teamIds: ["t1", "t2", "t3"], teamNames: { t1: "A", t2: "B", t3: "Vireo" },
  }), plan);
  expect(blocking).toHaveLength(1);
  expect(blocking[0].message).toMatch(/Vireo submitted after this plan was built/);
  expect(blocking[0].repair).toMatchObject({ type: "moveTeam", teamId: "t3" });
});

test("a team withdrew, and is dropped", () => {
  const { blocking } = checkDrift(basis, live({ teamIds: ["t1"] }), plan);
  expect(blocking[0].message).toMatch(/B withdrew/);
  expect(blocking[0].repair).toMatchObject({ type: "dropTeam", teamId: "t2" });
});

test("a judge on a panel lost their round one mark", () => {
  const { blocking } = checkDrift(basis, live({ judgeIds: ["j0"] }), plan);
  expect(blocking[0].message).toMatch(/Bo is no longer a first round judge/);
  expect(blocking[0].repair).toMatchObject({ type: "removeJudge", teamId: "t2", judgeUid: "j1" });
});

test("a judge who left but was only a spare is advisory", () => {
  const spare = { ...basis, judgeIds: ["j0", "j1", "j2"] };
  const { blocking, advisory } = checkDrift(spare, live({ judgeIds: ["j0", "j1"] }), plan);
  expect(blocking).toEqual([]);
  expect(advisory[0].message).toMatch(/no longer available/);
});

test("a room the plan uses was removed", () => {
  const { blocking } = checkDrift(basis, live({ rooms: ["R2"] }), plan);
  expect(blocking[0].message).toMatch(/R1 is no longer a configured room/);
});

test("batch count changed, so the shape of the day changed", () => {
  const { blocking } = checkDrift(basis, live({ batchCount: 4 }), plan);
  expect(blocking[0].repair).toEqual({ type: "rebuild" });
});

test("target changed, so the shape of the day changed", () => {
  const { blocking } = checkDrift(basis, live({ target: 2 }), { ...plan, basis: { ...basis, target: 3 } });
  expect(blocking.some((b) => b.repair.type === "rebuild")).toBe(true);
});

test("batch times changed, which is only a label", () => {
  const { blocking, advisory } = checkDrift(
    basis, live({ batchTimes: { 1: "6:00 PM", 2: "6:15 PM" } }), plan
  );
  expect(blocking).toEqual([]);
  expect(advisory[0].message).toMatch(/batch times changed/i);
});

test("a name changed", () => {
  const { blocking, advisory } = checkDrift(
    basis, live({ judgeNames: { j0: "Ada Lovelace", j1: "Bo" } }), plan
  );
  expect(blocking).toEqual([]);
  expect(advisory[0].message).toMatch(/Ada is now Ada Lovelace/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- checkDrift`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Write `checkDrift(basis, live, plan)` producing the items above, in this order: teams appeared, teams withdrew, judges on a panel who lost eligibility, rooms the plan uses that were removed, `batchCount` or `target` changed. Everything else — a judge who left but was only a spare, a `batchTimes` change, a changed name — goes to `advisory`.

For "a team submitted since", the `repair` names the first free room in the emptiest batch:

```js
function freeSlot(plan, live) {
  for (let batch = 1; batch <= live.batchCount; batch++) {
    const taken = new Set(
      Object.values(plan.assignments).filter((a) => a.batch === batch).map((a) => a.room)
    );
    const room = live.rooms.find((r) => !taken.has(r));
    if (room) return { batch, room };
  }
  return null;
}
```

If `freeSlot` returns `null`, the item's message says the event is full and the repair is `{ type: "rebuild" }`.

Then add `readLiveBasis(onlyCheckedIn)` in the same file, reading `teams`, `judges`, `fetchRooms()` and `fetchBatchConfig()` and shaping them exactly as `planSchedule` does — same `submitted` filter, same `isRound1Judge` and `checkedIn` filters, and `displayName` imported from `scheduleConfig.js` (Task 1) rather than redefined here.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:ci -- checkDrift`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/judge/checkDrift.js src/user/judge/checkDrift.test.js src/user/judge/scheduleConfig.js
git commit -m "name what moved since a plan was built"
```

---

### Task 6: `draftStore` — persisting the draft

**Files:**
- Create: `src/user/judge/draftStore.js`, `src/user/judge/draftStore.test.js`

**Interfaces:**
- Produces: `readDraft(): Promise<plan|null>`, `saveDraft(plan): Promise<{ ok, error?, version? }>`, `clearDraft(): Promise<{ ok }>`, `subscribeDraft(cb): () => void`

`saveDraft` writes `version: (plan.version ?? 0) + 1` and refuses if the stored version is not `plan.version`.

- [ ] **Step 1: Write the failing tests**

```js
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));
const mockUpdate = jest.fn();
const mockGet = jest.fn();
jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path: path ?? "" }),
  get: (...a) => mockGet(...a),
  update: (...a) => mockUpdate(...a),
  onValue: jest.fn(() => jest.fn()),
  serverTimestamp: () => 1700000000000,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));
jest.mock("../admin/adminAction.js", () => ({ resolveName: async () => "Sam" }));

const { readDraft, saveDraft, clearDraft } = require("./draftStore");

const plan = (over = {}) => ({
  assignments: {}, basis: { teamIds: [], judgeIds: [], rooms: [], batchCount: 3, batchTimes: {}, target: 3 },
  judgeNames: {}, teamNames: {}, onlyCheckedIn: false, edits: [], version: 0, ...over,
});

beforeEach(() => {
  mockUpdate.mockReset(); mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
});

test("the draft is written to /scheduleDraft and nowhere else", async () => {
  await saveDraft(plan());
  const [, payload] = mockUpdate.mock.calls[0];
  expect(Object.keys(payload)).toEqual(["scheduleDraft"]);
});

test("saving bumps the version", async () => {
  const result = await saveDraft(plan({ version: 3 }));
  expect(result.ok).toBe(true);
  expect(mockUpdate.mock.calls[0][1].scheduleDraft.version).toBe(4);
});

test("a stale version is refused and names who moved it", async () => {
  mockGet.mockResolvedValue({
    exists: () => true,
    val: () => ({ version: 7, createdByName: "Sam" }),
  });
  const result = await saveDraft(plan({ version: 3 }));
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/Sam/);
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("reading an absent draft is null, not an error", async () => {
  expect(await readDraft()).toBeNull();
});

test("edits round-trip through the keyed shape", async () => {
  const withEdit = plan({
    edits: [{ op: { type: "addJudge", teamId: "t1", judgeUid: "j1" }, summary: "Added Bo to A", before: null }],
  });
  await saveDraft(withEdit);
  const stored = mockUpdate.mock.calls[0][1].scheduleDraft;
  expect(Array.isArray(stored.edits)).toBe(false);
  mockGet.mockResolvedValue({ exists: () => true, val: () => stored });
  const back = await readDraft();
  expect(back.edits).toHaveLength(1);
  expect(back.edits[0].summary).toBe("Added Bo to A");
});

test("clearing writes a null", async () => {
  await clearDraft();
  expect(mockUpdate.mock.calls[0][1]).toEqual({ scheduleDraft: null });
});
```

The `edits` round-trip test is the one that matters: `edits` is an ordered log stored keyed, per the codebase rule, so `saveDraft` converts array → keyed on the way out and `readDraft` converts back, sorted by key.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- draftStore`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Key `edits` on write as `{ "0000": entry, "0001": entry }` — zero-padded index, so string key order is chronological — and read back with `Object.keys(...).sort().map(...)`. Stamp `createdAt`, `createdBy`, `createdByName` (via `resolveName`) on the first save only; carry them forward after.

`saveDraft` reads `scheduleDraft/version` first and refuses when it does not match `plan.version`:

```js
return {
  ok: false,
  error:
    `${stored.createdByName ?? "Another organizer"} changed this draft while you were ` +
    `looking. Reload the preview to pick up their version.`,
};
```

`subscribeDraft(cb)` wraps `onValue` on `scheduleDraft` and hands back the decoded plan or `null`, matching `subscribeToSnapshots`'s shape in `snapshots.js:113`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:ci -- draftStore`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/judge/draftStore.js src/user/judge/draftStore.test.js
git commit -m "keep a schedule draft where a reload cannot lose it"
```

---

### Task 7: `publishPlan` — the writer

**Files:**
- Create: `src/user/judge/publishPlan.js`, `src/user/judge/publishPlan.test.js`
- Delete: `src/user/judge/generateSchedule.test.js`

**Interfaces:**
- Consumes: `checkDrift`, `readLiveBasis` (Task 5); `clearDraft` (Task 6); `guardWith` from `../admin/snapshots.js`; `resolveName` from `../admin/adminAction.js`
- Produces: `publishPlan(plan): Promise<{ ok, error?, drift?, snapshotId?, stats? }>`

- [ ] **Step 1: Write the failing tests**

Start from `generateSchedule.test.js` — keep its mock preamble, `world()`, `schedulePayload()` and `snapshotPayload()` helpers. Two changes to `world()`: add an `unsubmitted = []` option that sets `submitted: false` on those team ids, and add `"scheduleDraft"` to its lookup table returning `undefined`, so `draftStore` reads resolve.

Then replace the call under test.

```js
const { publishPlan } = require("./publishPlan");
const { planSchedule } = require("./planSchedule");

/** A plan built from the same mocked world we are about to publish into. */
async function built() {
  const { plan } = await planSchedule({});
  mockUpdate.mockClear();
  return plan;
}

describe("a restore point comes first", () => {
  test("the schedule is written only after a restore point exists", async () => {
    const result = await publishPlan(await built());
    expect(result.ok).toBe(true);
    const order = mockUpdate.mock.calls.map(([, p]) =>
      p["snapshots/generated-id"] ? "snapshot" : "schedule"
    );
    expect(order.indexOf("snapshot")).toBeLessThan(order.indexOf("schedule"));
  });

  test("the restore point carries the state it is about to replace", async () => {
    await publishPlan(await built());
    const stored = snapshotPayload()["snapshots/generated-id"];
    expect(stored.entries.map((e) => e.path)).toEqual(
      expect.arrayContaining(["teams", "judges", "config/scheduleMeta"])
    );
  });

  test("nothing is replaced when the restore point cannot be written", async () => {
    const plan = await built();
    mockUpdate.mockRejectedValueOnce(new Error("network down"));
    const result = await publishPlan(plan);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/restore point/i);
    expect(schedulePayload()).toBeUndefined();
  });
});

describe("what gets written", () => {
  test("every team in the plan gets its slot", async () => {
    const plan = await built();
    await publishPlan(plan);
    const payload = schedulePayload();
    for (const teamId of Object.keys(plan.assignments)) {
      expect(payload[`teams/${teamId}/schedule`]).toMatchObject({ id: teamId });
    }
  });

  test("each judge gets their own copy, keyed by team", async () => {
    const plan = await built();
    await publishPlan(plan);
    const payload = schedulePayload();
    for (const a of Object.values(plan.assignments)) {
      for (const j of a.judges) {
        expect(payload[`judges/${j.judgeId}/teamAssignments`][a.id]).toMatchObject({
          id: a.id, room: a.room, batch: a.batch,
        });
      }
    }
  });

  test("a judge with no assignment has their old list cleared", async () => {
    // one team, twelve judges: the panel caps at 3, so most judges are spares
    mockGet.mockImplementation(world({ teams: 1, judges: 12 }));
    const plan = await built();
    await publishPlan(plan);
    const payload = schedulePayload();
    const assigned = new Set(plan.assignments.t0.judges.map((j) => j.judgeId));
    const spare = ["j0", "j11"].find((uid) => !assigned.has(uid));
    expect(payload[`judges/${spare}/teamAssignments`]).toBeNull();
  });

  test("a team not in the plan has its old slot cleared", async () => {
    // t11 never submitted, so the planner skips it and publish must clear it
    mockGet.mockImplementation(world({ teams: 12, unsubmitted: ["t11"] }));
    const plan = await built();
    expect(plan.assignments.t11).toBeUndefined();
    await publishPlan(plan);
    expect(schedulePayload()["teams/t11/schedule"]).toBeNull();
  });

  test("the draft is cleared in the same update as the schedule", async () => {
    await publishPlan(await built());
    expect(schedulePayload().scheduleDraft).toBeNull();
  });

  test("scheduleMeta records who published and from what", async () => {
    await publishPlan(await built());
    const meta = schedulePayload()["config/scheduleMeta"];
    expect(meta).toMatchObject({ generatedBy: "admin-1", teams: 12, judges: 12 });
  });

  test("the audit entry names the hand edits", async () => {
    const plan = await built();
    plan.edits = [{ op: { type: "addJudge" }, summary: "Added Di to B", before: null }];
    await publishPlan(plan);
    const entry = schedulePayload()["adminLog/generated-id"];
    expect(entry.action).toBe("schedule.publish");
    expect(entry.summary).toMatch(/Added Di to B/);
    expect(entry.undoable).toBe(false);
  });
});

describe("it refuses", () => {
  test("a plan whose teams have moved underneath it", async () => {
    const plan = await built();
    plan.basis.teamIds = plan.basis.teamIds.filter((id) => id !== "t3");
    const result = await publishPlan(plan);
    expect(result.ok).toBe(false);
    expect(result.drift.blocking).not.toHaveLength(0);
    expect(schedulePayload()).toBeUndefined();
  });

  test("a plan containing a team with no judges", async () => {
    const plan = await built();
    plan.assignments.t0.judges = [];
    const result = await publishPlan(plan);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no judges/i);
    expect(schedulePayload()).toBeUndefined();
  });

  test("an empty plan", async () => {
    const plan = await built();
    plan.assignments = {};
    const result = await publishPlan(plan);
    expect(result.ok).toBe(false);
    expect(schedulePayload()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- publishPlan`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`publishPlan.js` is `getJudgeSchedule.js` lines 243–300 with the plan supplied rather than built. Order:

1. `requireAdmin("publish the judging schedule")`
2. Refuse an empty plan, or any assignment with `judges.length === 0`, naming the teams — this is where the "a placed team may start empty" allowance from Task 4 is finally caught.
3. `readLiveBasis(plan.onlyCheckedIn)` then `checkDrift`. Blocking drift returns `{ ok: false, drift }` and writes nothing.
4. `guardWith({ label, reason, paths: ["teams", "judges", "config/scheduleMeta"] })` — keep the existing label and reason wording.
5. One `update()` carrying: every judge id in the live roster mapped to their derived `teamAssignments` (or `null`), every live team id mapped to its assignment (or `null`), `config/scheduleMeta`, the `adminLog` entry, and `scheduleDraft: null`.

Derive the per-judge copies here rather than carrying them in the plan:

```js
const byJudge = {};
for (const assignment of Object.values(plan.assignments)) {
  for (const judge of assignment.judges) {
    (byJudge[judge.judgeId] ??= {})[assignment.id] = assignment;
  }
}
```

The audit summary keeps the existing sentence and appends the edits when there are any:

```js
summary:
  `Published the judging schedule: ${teams} teams, ${judges} judges` +
  `${plan.onlyCheckedIn ? ", checked-in only" : ""}. Restore point taken first.` +
  (plan.edits?.length
    ? ` Hand edited: ${plan.edits.map((e) => e.summary).join("; ")}.`
    : ""),
```

Return `stats: computeStats(plan)`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:ci -- publishPlan`
Expected: PASS

- [ ] **Step 5: Delete the superseded test and commit**

```bash
git rm src/user/judge/generateSchedule.test.js
git add src/user/judge/publishPlan.js src/user/judge/publishPlan.test.js
git commit -m "publish a plan, refusing one built on state that has moved"
```

---

### Task 8: `ConfirmDialog`

**Files:**
- Modify: `src/user/admin/adminUi.js`
- Create: `src/user/admin/confirmDialog.test.js`

**Interfaces:**
- Produces: `<ConfirmDialog open title consequences={[]} typeToConfirm confirmLabel onConfirm onCancel />` — `consequences` is a string array; when `typeToConfirm` is a non-empty string the confirm button stays disabled until the field matches it exactly.

- [ ] **Step 1: Write the failing test**

```js
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./adminUi";

const props = {
  open: true, title: "Publish the schedule?",
  consequences: ["A restore point will be taken.", "Every assignment will be replaced."],
  confirmLabel: "Publish", onConfirm: jest.fn(), onCancel: jest.fn(),
};

test("it lists what will happen", () => {
  render(<ConfirmDialog {...props} />);
  expect(screen.getByText(/Every assignment will be replaced/)).toBeInTheDocument();
});

test("without a phrase, confirming is immediate", async () => {
  const onConfirm = jest.fn();
  render(<ConfirmDialog {...props} onConfirm={onConfirm} />);
  await userEvent.click(screen.getByRole("button", { name: "Publish" }));
  expect(onConfirm).toHaveBeenCalled();
});

test("with a phrase, confirming is refused until it matches", async () => {
  const onConfirm = jest.fn();
  render(<ConfirmDialog {...props} typeToConfirm="HooHacks Ideathon" onConfirm={onConfirm} />);
  const button = screen.getByRole("button", { name: "Publish" });
  expect(button).toBeDisabled();

  await userEvent.type(screen.getByLabelText(/type/i), "hoohacks ideathon");
  expect(button).toBeDisabled();

  await userEvent.clear(screen.getByLabelText(/type/i));
  await userEvent.type(screen.getByLabelText(/type/i), "HooHacks Ideathon");
  expect(button).toBeEnabled();
  await userEvent.click(button);
  expect(onConfirm).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- confirmDialog`
Expected: FAIL — `ConfirmDialog is not exported`

- [ ] **Step 3: Implement**

Add `ConfirmDialog` to `adminUi.js` using MUI `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, an `Alert severity="warning"` listing `consequences`, and a `TextField` labelled `Type "<phrase>" to confirm` when `typeToConfirm` is set. Reset the typed value whenever `open` goes false. Match the existing dialog styling in `PeopleSection.js`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:ci -- confirmDialog`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/user/admin/adminUi.js src/user/admin/confirmDialog.test.js
git commit -m "confirm a destructive action by typing the event name"
```

---

### Task 9: The preview page

**Files:**
- Create: `src/user/admin/schedule/SchedulePreview.js`, `src/user/admin/schedule/PlanGrid.js`, `src/user/admin/schedule/TeamSlotDrawer.js`, `src/user/admin/schedule/DriftPanel.js`

**Interfaces:**
- Consumes: everything from Tasks 2–8
- Produces: default export `SchedulePreview` — a `Layout`-wrapped page

- [ ] **Step 1: Build `PlanGrid`**

Props: `{ plan, stats, onOpenTeam }`. Renders a `Grid` of batch columns, each holding the assignments for that batch sorted by `basis.rooms` order. Stack to one column below `sm`.

Each team card shows the room, the team name, and its judges as `Chip`s. Card border: `error.main` when `judges.length === 0`, `warning.main` when `judges.length < plan.basis.target`, otherwise default. Clicking the card calls `onOpenTeam(teamId)`.

Above the grid, a stat row built from `stats` using the existing `PageHeader` `stats` prop shape: teams, judges, panels `min–max`, spares, below target, repeat pairings.

Beside the grid, two lists rendered only when non-empty: spare judges (`stats.spareJudgeIds` named from `plan.judgeNames`), and unscheduled teams (`stats.unscheduledTeamIds` named from `plan.teamNames`, each with a Place button calling `onOpenTeam`).

- [ ] **Step 2: Build `TeamSlotDrawer`**

Props: `{ open, plan, teamId, onEdit, onClose }`. Uses the `EditDrawer` shell from `src/user/admin/records/EditDrawer.js`.

Contents: a batch `Select` (1…`basis.batchCount`), a room `Select` listing only rooms free in the selected batch plus the team's current room, an Apply button dispatching `{ type: "moveTeam", teamId, batch, room }`; then the judge list, each row with a Remove button and a Swap `Select`; then an Add judge `Select` over judges not already on the team, dispatching `addJudge`.

`onEdit(op)` returns the `applyEdit` result; when `ok` is false, render `result.error` in an `Alert severity="error"` inside the drawer and leave the drawer open.

- [ ] **Step 3: Build `DriftPanel`**

Props: `{ drift, onRepair, onRebuild }`. Blocking items in an `Alert severity="error"`, each with its message and, when `repair` is present, a button — labelled `Place`, `Drop`, `Remove` or `Rebuild` by `repair.type` — calling `onRepair(item.repair)`. Advisory items in an `Alert severity="info"`, message only.

- [ ] **Step 4: Build `SchedulePreview`**

```
on mount:  subscribeDraft(setPlan)
if no draft: show the onlyCheckedIn checkbox and a "Build a plan" button → planSchedule → saveDraft
if a draft:  <PlanGrid> + <TeamSlotDrawer> + sticky publish bar
```

An edit is `applyEdit(plan, op)` → on `ok`, `saveDraft(result.plan)`; on failure, surface `error` in the drawer. A `saveDraft` refusal goes to the page `Snackbar` — the live subscription will already have replaced the plan with the other organizer's version.

Beside the edit count, an **Undo** button calling `undoEdit(plan)` (Task 4) and saving the result, labelled with the newest edit's `summary` — `Undo "Added Di to B"` — and disabled when `plan.edits` is empty. Repeated, it walks back to what the generator produced, which is why there is no separate "revert to generated" control.

The publish bar shows `stats`, the count of `plan.edits`, and a Publish button opening `ConfirmDialog` with:
- consequences: `"A restore point will be taken first."`, `"Every judge and team assignment in the event is replaced."`, and when `readScheduleMeta()` reports `scoredTeams > 0`, `"<n> team(s) already have scores. They are not deleted, but they will belong to judges who are no longer assigned."`
- `typeToConfirm`: `config.eventName` when set, otherwise `String(stats.teams)` — only when a schedule already exists.

On confirm, `publishPlan(plan)`. On `ok`, `Snackbar` success and navigate to `/user/admin/judging`. On a `drift` result, render `<DriftPanel>`; `onRepair` runs the op through `applyEdit` (or, for `dropTeam`, deletes the assignment and saves) and `onRebuild` re-runs `planSchedule` and overwrites the draft after a `ConfirmDialog` whose consequence is `"Your <n> hand edits are discarded."`

Also a Discard draft button, guarded by `ConfirmDialog`, calling `clearDraft()`; and the draft's age from `createdAt` with `createdByName`.

- [ ] **Step 5: Verify by hand against the emulator**

```bash
npm run emulators        # terminal 1
npm run seed -- --teams 20 --judges 14 --rooms 10   # terminal 2
npm run start:emulator   # terminal 3
```

Sign in as `admin@example.com` / `testtest`, open `/user/admin/schedule`, and confirm: a plan builds; a judge swap sticks across a browser reload; moving a team into an occupied room is refused by name; publishing writes the schedule and the draft disappears.

- [ ] **Step 6: Commit**

```bash
git add src/user/admin/schedule
git commit -m "preview and hand-edit a judging schedule before publishing it"
```

---

### Task 10: Wire it up and delete the old path

**Files:**
- Modify: `src/App.js:167-175`, `src/siteNav.js:54-60`, `src/user/judge/Assignments.js:17,119-152,337-343`, `src/schema.test.js`
- Delete: `src/user/judge/getJudgeSchedule.js`

- [ ] **Step 1: Add the route and the nav entry**

```js
// App.js, inside the admin route group, before "control"
<Route path="schedule" element={<ProtectedRoute requiredRoles={["admin"]}><SchedulePreview /></ProtectedRoute>} />
```

```js
// siteNav.js, after "Judging progress"
{ to: "/user/admin/schedule", label: "Schedule" },
```

- [ ] **Step 2: Write the failing schema test**

```js
// src/schema.test.js
describe("the schedule draft is admin-only", () => {
  test("/scheduleDraft has no rule of its own", () => {
    expect(RULES.rules.scheduleDraft).toBeUndefined();
  });

  test("the root rule is what covers it", () => {
    expect(RULES.rules[".read"]).toContain("admins");
    expect(RULES.rules[".write"]).toContain("admins");
  });
});
```

This passes immediately — that is the point. It fails the day someone adds a `.read` there, which would hand the plan to every signed-in judge and competitor.

- [ ] **Step 3: Strip generation out of `Assignments.js`**

Remove `handleGenerateClick`, `generating`, `onlyCheckedIn`, `generateResult`, and the `getJudgeSchedule` import. Keep `scheduleMeta`, importing `readScheduleMeta` from `./scheduleConfig`. Replace the Generate button:

```jsx
<Button variant="contained" component={Link} to="/user/admin/schedule">
  {scheduleMeta?.generatedAt ? "Plan a new schedule" : "Plan schedule"}
</Button>
```

Replace the `window.confirm` at the final-round deactivate (`Assignments.js:174`) with `ConfirmDialog`, consequences: `"Assignments are withdrawn from every judge."`, `"The standings are archived."`

- [ ] **Step 4: Delete `getJudgeSchedule.js` and run everything**

```bash
git rm src/user/judge/getJudgeSchedule.js
npm run test:ci
```

Expected: PASS, and no module resolves to the deleted file. If anything still imports it, repoint to `scheduleConfig.js` (`readScheduleMeta`) or `schedulePlan.js` (constants).

- [ ] **Step 5: Commit**

```bash
git add -A src/App.js src/siteNav.js src/user/judge src/schema.test.js
git commit -m "route the judging page through the schedule preview"
```

---

## Phase 2 — the same step for the final round and for restoring

### Task 11: Split the final round, and preview the cut

**Files:**
- Modify: `src/user/judge/finalRoundService.js:75-215`
- Create: `src/user/judge/finalRoundPlan.test.js`, `src/user/admin/schedule/FinalRoundPreview.js`

**Interfaces:**
- Produces:
  - `planFinalRound({ limit = 4, requireSubmitted = true }): Promise<{ ok, error?, finalists, ranked, warnings, basis: { cardCounts: { [teamId]: number } } }>`
  - `publishFinalRound({ finalists, basis }): Promise<{ ok, error?, drift?, warnings, snapshotId }>`

- [ ] **Step 1: Write the failing tests**

```js
const { planFinalRound, publishFinalRound } = require("./finalRoundService");

test("planning writes nothing", async () => {
  const result = await planFinalRound({});
  expect(result.ok).toBe(true);
  expect(mockUpdate).not.toHaveBeenCalled();
});

test("it names a finalist that reached the cut on too few judges", async () => {
  const { warnings } = await planFinalRound({});
  expect(warnings.join(" ")).toMatch(/fewer than 2 judges/i);
});

test("it names a tie straddling the cut line", async () => {
  const { warnings } = await planFinalRound({});
  expect(warnings.join(" ")).toMatch(/tied on average/);
});

test("it records how many cards each team was ranked on", async () => {
  const { basis } = await planFinalRound({});
  expect(Object.keys(basis.cardCounts).length).toBeGreaterThan(0);
});

test("publishing refuses when a card arrived since the ranking", async () => {
  const plan = await planFinalRound({});
  plan.basis.cardCounts[plan.finalists[0].teamId] -= 1;
  const result = await publishFinalRound(plan);
  expect(result.ok).toBe(false);
  expect(result.drift).toMatch(/scored since/i);
  expect(mockUpdate).not.toHaveBeenCalled();
});
```

Build the mocked world the way `publishPlan.test.js` does, with `scores/round1` populated so `loadFirstRoundScores` has cards to rank: at least five teams, one with a single card, and two tied on average across the cut line.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- finalRoundPlan`
Expected: FAIL — `planFinalRound is not a function`

- [ ] **Step 3: Implement the split**

Cut `activateFinalRound` at the `guardWith` call (`finalRoundService.js:207`). Everything above becomes `planFinalRound` and returns rather than continuing; everything below becomes `publishFinalRound`, which re-reads the score cards, compares counts against `basis.cardCounts`, and returns `{ ok: false, drift }` when any team's count moved.

`publishFinalRound` takes `finalists` as given, so an organizer's override is honoured. Keep `activateFinalRound` as a thin composition **only** for `deactivateFinalRound`'s tests if they depend on it; otherwise delete it and repoint `Assignments.js`.

- [ ] **Step 4: Build `FinalRoundPreview`**

A dialog opened from the Judging page's Activate button. A table of `ranked`: rank, team, average, fundable votes, judge count. A horizontal rule after `limit`. A checkbox per row to include or exclude, seeded from `finalists`. Warnings in an `Alert severity="warning"` above. Confirm through `ConfirmDialog`, consequences: `"A restore point will be taken first."`, `"Every judge's final assignments are replaced."`

On a `drift` result, an `Alert severity="error"` with a Re-rank button that calls `planFinalRound` again.

- [ ] **Step 5: Run and commit**

Run: `npm run test:ci`

```bash
git add src/user/judge/finalRoundService.js src/user/judge/finalRoundPlan.test.js src/user/admin/schedule/FinalRoundPreview.js src/user/judge/Assignments.js
git commit -m "show the final round cut before writing it"
```

---

### Task 12: Diff a restore point before restoring

**Files:**
- Create: `src/user/admin/danger/snapshotDiff.js`, `src/user/admin/danger/snapshotDiff.test.js`
- Modify: `src/user/admin/danger/RestorePointsSection.js`

**Interfaces:**
- Produces: `diffSnapshot(entries, live): { byPath: [{ path, added, changed, removed }], lostScores: [{ teamId, judgeUid }] }` where `entries` is the snapshot's `[{ path, value }]` with `value` a JSON string, and `live` is `{ [path]: value }`.

- [ ] **Step 1: Write the failing tests**

```js
const { diffSnapshot } = require("./snapshotDiff");

const entries = (obj) =>
  Object.entries(obj).map(([path, value]) => ({ path, value: JSON.stringify(value) }));

test("counts what changes per path", () => {
  const result = diffSnapshot(
    entries({ teams: { t1: { name: "A" }, t2: { name: "B" } } }),
    { teams: { t1: { name: "A" }, t3: { name: "C" } } }
  );
  expect(result.byPath).toEqual([{ path: "teams", added: 1, changed: 0, removed: 1 }]);
});

test("a score present now and absent in the snapshot is named as a loss", () => {
  const result = diffSnapshot(
    entries({ "scores/round1": { t1: { j0: { total: 30 } } } }),
    { "scores/round1": { t1: { j0: { total: 30 }, j1: { total: 28 } } } }
  );
  expect(result.lostScores).toEqual([{ teamId: "t1", judgeUid: "j1" }]);
});

test("a score in the snapshot but not live is not a loss", () => {
  const result = diffSnapshot(
    entries({ "scores/round1": { t1: { j0: {}, j1: {} } } }),
    { "scores/round1": { t1: { j0: {} } } }
  );
  expect(result.lostScores).toEqual([]);
});

test("a null in the snapshot means the path did not exist", () => {
  const result = diffSnapshot(entries({ teams: null }), { teams: { t1: { name: "A" } } });
  expect(result.byPath[0].removed).toBe(1);
});
```

The last test is why `snapshots.js` JSON-encodes: a literal `null` means "this did not exist", and restoring it removes everything under the path.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:ci -- snapshotDiff`
Expected: FAIL — module not found

- [ ] **Step 3: Implement, then wire into the section**

`diffSnapshot` parses each entry's JSON, compares top-level child keys against `live[path]`, and counts. `lostScores` walks `scores/*` two levels deep — team then judge — for cards live now and absent in the snapshot.

In `RestorePointsSection.js`, a Preview button per row reads `snapshots/{id}` and the live values for that snapshot's `paths`, then shows the diff in a dialog. The Restore button moves inside that dialog and goes through `ConfirmDialog`, with consequences: the per-path counts, and when `lostScores` is non-empty, `"<n> score card(s) will be destroyed: <team> by <judge>, …"` naming them from the teams and judges data already subscribed in `Control.js`.

- [ ] **Step 4: Run and commit**

Run: `npm run test:ci -- snapshotDiff`
Expected: PASS

```bash
git add src/user/admin/danger
git commit -m "show what a restore point will destroy before restoring it"
```

---

## Phase 3 — documentation

### Task 13: Update the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite the four affected passages**

- **"On the day", step 2** — `**Generate Schedule** on the Judging page` becomes: plan the schedule, review it, then publish. Name `/user/admin/schedule`.
- **"When something goes wrong"** — the row `A team submitted after generation` currently says "Do not regenerate". Add that a team submitting before publishing is caught as drift, with a Place button in the preview.
- **The control panel table** — add a Schedule row.
- **Schema** — add `/scheduleDraft` with a one-line note that it is admin-only through the root rule, holds the plan and its `basis`, and is deleted on publish.

- [ ] **Step 2: Add a "Planning a schedule" section**

Cover, in the README's register: the draft survives a reload and is shared between organizers; edits are recorded and shown in the audit entry when published; publish refuses on drift and offers repairs; a rebuild discards hand edits; and the honest limitation from the spec — **a hand-repaired plan no longer carries the allocator's balance and rotation guarantees**, and the stats bar is what to read instead.

- [ ] **Step 3: Confirm the rules note is still true**

The README's "Current version: 5. Publish it before the event" is unchanged by this work. Add nothing about republishing — there is nothing to republish.

- [ ] **Step 4: Run the whole suite and commit**

```bash
npm run test:ci
git add README.md
git commit -m "document planning a schedule before publishing it"
```

---

## Self-review notes

Checked against the spec:

- **Spec coverage.** Planner/writer split → Tasks 2, 7. Draft at `/scheduleDraft` → Task 6. Four edit ops → Task 4. `computeStats` → Task 3. Drift with blocking/advisory and repairs → Tasks 5, 7. Preview page → Task 9. Final round preview → Task 11. Restore diff → Task 12. Typed confirmation → Tasks 8, 9, 10, 11, 12. `schema.test.js` assertion → Task 10. README → Task 13. No spec section is unclaimed.
- **Two deliberate deviations from the spec**, both narrowing duplication rather than scope:
  1. `applyEdit` returns `{ ok, plan, error, conflict }` rather than the spec's `{ plan, warnings, blocked }`. `{ ok, error, conflict }` is the shape every other service in this codebase already returns, and `warnings` duplicated what `computeStats` derives.
  2. `planSchedule` no longer builds `assignmentsByJudge`; `publishPlan` derives the per-judge copies from the plan. One producer instead of two that could disagree.
- **Task 4's empty-panel allowance** is the one place the invariants are deliberately relaxed: placing a team creates it with no judges, and Task 7 refuses to publish that. This is called out in both tasks so an executor reading them out of order cannot miss it.
- **Four issues fixed during this review**, recorded so a reader is not puzzled by them later: `displayName` is extracted in Task 1 rather than Task 5, so the planner and the drift reader share it from the start; two of Task 7's clearing tests originally mutated a plan in ways the drift check would have blocked, and now set up the world instead; Task 9 had no Undo control despite Task 4 exporting `undoEdit`; Task 11's test imported only `planFinalRound` while using both.
- **Phase boundaries are checkpoints.** Phase 1 (Tasks 1–10) delivers the schedule preview as working software on its own. Phases 2 and 3 can be deferred or split into their own plan without leaving anything half-built.
