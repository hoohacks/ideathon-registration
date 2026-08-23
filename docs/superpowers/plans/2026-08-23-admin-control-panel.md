# Admin Control Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins direct control over judging rooms, event config, the admin list, record fields, assignment overrides and destructive recovery — with every write recorded to an undoable audit log.

**Architecture:** One `applyAdminAction` primitive puts each change and its audit entry into the same atomic Realtime Database multi-path update, so a change can never exist without its log entry. Five thin domain services build change-sets and call it; pure change-builder functions are separated from IO so the fan-out logic is unit-testable without a database. A new `/user/admin/control` page owns config that has no home today; the three existing entity pages gain edit drawers in place.

**Tech Stack:** React 18, MUI 5, Firebase Realtime Database (modular SDK v9), react-router-dom 6, CRA/jest for units, vitest + Firebase emulator for rules.

**Spec:** `docs/superpowers/specs/2026-08-23-admin-control-panel-design.md`

## Global Constraints

- Node `>=18 <23`. Do not add dependencies — everything needed is already in `package.json`.
- Services return `{ ok, error, ... }` and **never throw**. Match `getJudgeSchedule` and `assignmentEdits`.
- `config/judgingRooms` **stays an array of strings**. `fetchRooms()` tolerates array or object; do not migrate the shape.
- Audit `before`/`after` are **JSON strings**, never live values. RTDB drops nulls on write; `"null"` must survive.
- `adminLog/{id}/by` is pinned to `auth.uid` by the rules. Never write an entry on another admin's behalf.
- Serialized change-set over **50000 bytes** ⇒ entry stores counts only and sets `undoable: false`.
- No creating or deleting competitors, judges or teams. Out of scope by decision.
- Reuse `src/user/admin/adminUi.js` (`PageHeader`, `FilterBar`, `SearchField`, `RowList`, `Row`). Do not invent new furniture.
- Keep files ~100–150 lines. One responsibility each.
- Pure change-builders take data snapshots as arguments and return `changes[]`. All `get`/`update` lives in the async wrapper.
- Unit tests mock firebase exactly as `src/user/judge/schedule.test.js` does. Rules tests use `test/rules/helpers.mjs`.
- **Two jest constraints, both found the hard way in Task 2 — follow them in every test file:**
  1. A `jest.mock()` factory may not reference an out-of-scope variable **unless its name starts with `mock`** (case-insensitive). Hence `mockGet` / `mockUpdate`, never `getMock` / `updateMock`.
  2. create-react-app sets **`resetMocks: true`**, which strips the implementation off every `jest.fn` before each test. An implementation passed at declaration (`jest.fn(async () => …)`) is **gone by the first test** and the mock returns `undefined`. Re-establish every implementation — including `requireAdmin` — in `beforeEach`.
- **The RTDB emulator does not always shut down** after `npm run test:rules`, leaving port 9000 held and the next run failing with "port taken". Kill the stale `firebase-database-emulator` java process before re-running.

**Test commands:**
- One unit file: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/adminAction.test.js`
- All units: `npm run test:ci`
- Rules (needs a JVM): `npm run test:rules`

## File Structure

| File | Responsibility |
| --- | --- |
| `database.rules.json` | + `/adminLog` validate block |
| `src/schema.test.js` | bump `EXPECTED_VERSION` → 3, new digest, pin `by` |
| `test/rules/adminLog.test.mjs` | executes the new rules against the emulator |
| `src/user/admin/adminAction.js` | `captureBefore`, `encodeChanges`, `applyAdminAction`, `undoAdminAction` |
| `src/user/admin/roomsService.js` | `roomsInUse`, `remapChanges` (pure) + add/rename/remove |
| `src/user/admin/eventConfig.js` | batch times/count, event start, final round room |
| `src/user/admin/adminsService.js` | `revokeGuard` (pure) + grant/revoke |
| `src/user/admin/recordEdits.js` | `renameTeamChanges`, `moveMemberChanges` (pure) + field edits |
| `src/user/admin/dangerZone.js` | `overrideSlotChanges` (pure) + delete score, clear schedule, un-submit, check-in |
| `src/user/admin/Control.js` | page shell, one subscription, composes sections |
| `src/user/admin/control/*.js` | one section each + `RemapDialog`, `EditDrawer` |
| `src/user/admin/edit/*.js` | three entity edit drawers |
| `src/user/judge/getJudgeSchedule.js` | + `fetchBatchConfig()`, read batch config |
| `src/App.js`, `src/siteNav.js` | route + nav entry |

**Dependency spine:** Task 1 (rules) → Task 2 (primitive) → Task 3 (undo) → Tasks 4–8 (services, independent of each other) → Tasks 9–14 (control panel) → Tasks 15–17 (drawers) → Task 18 (smoke).

---

## Phase 1 — The engine

### Task 1: `/adminLog` rules

**Files:**
- Modify: `database.rules.json` (add sibling after the `"scores"` block)
- Modify: `src/schema.test.js:184-185` (`EXPECTED_VERSION`, `EXPECTED_DIGEST`)
- Create: `test/rules/adminLog.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: the `/adminLog/{entryId}` shape every later task writes — `at` (number), `by` (string, `=== auth.uid`), `byName`, `action`, `summary`, `undoable` (bool), `changes` (list of `{path, before, after}` strings), `undone` (`{at, by}`)

- [ ] **Step 1: Write the failing rules test**

Create `test/rules/adminLog.test.mjs`:

```js
/**
 * /adminLog.
 *
 * The log exists so an overwrite on event day can be traced; RTDB keeps no
 * history of its own. It is NOT tamper-proof — admins hold root write and
 * deletes skip validation — so these tests pin the shape and the author, which
 * are the parts rules can actually enforce.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { ref, get, set } from "firebase/database";
import { makeTestEnv, seed, baseWorld, scoreCard } from "./helpers.mjs";

let testEnv;

beforeAll(async () => { testEnv = await makeTestEnv(); });
afterAll(async () => { await testEnv?.cleanup(); });
beforeEach(async () => {
  await testEnv.clearDatabase();
  await seed(testEnv, baseWorld());
});

const db = (uid) => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).database();

const entry = (overrides = {}) => ({
  at: Date.now() - 1000,
  by: "admin",
  byName: "An Organiser",
  action: "room.remove",
  summary: "Removed Rice 110",
  undoable: true,
  changes: [{ path: "config/judgingRooms", before: '["Rice 110"]', after: "[]" }],
  ...overrides,
});

describe("who can see the log", () => {
  test("an admin may read it", async () => {
    await assertSucceeds(get(ref(db("admin"), "adminLog")));
  });

  test("a competitor may not", async () => {
    await assertFails(get(ref(db("alice"), "adminLog")));
  });

  test("a judge may not", async () => {
    await assertFails(get(ref(db("judge1"), "adminLog")));
  });

  test("signed out may not", async () => {
    await assertFails(get(ref(db(null), "adminLog")));
  });
});

describe("what an entry may contain", () => {
  test("an admin writes a well-formed entry", async () => {
    await assertSucceeds(set(ref(db("admin"), "adminLog/e1"), entry()));
  });

  test("a non-admin cannot write one at all", async () => {
    await assertFails(set(ref(db("judge1"), "adminLog/e1"), entry({ by: "judge1" })));
  });

  test("the author is pinned to the caller, so it cannot be forged", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({ by: "judge1" })));
  });

  test("an unknown key is rejected", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({ sneaky: true })));
  });

  test("a missing required field is rejected", async () => {
    const { summary, ...withoutSummary } = entry();
    await assertFails(set(ref(db("admin"), "adminLog/e1"), withoutSummary));
  });

  test("a future timestamp is rejected", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({ at: Date.now() + 600000 })));
  });

  test("a non-string before/after is rejected", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({
      changes: [{ path: "config/judgingRooms", before: ["Rice 110"], after: [] }],
    })));
  });

  test("an unknown key inside a change is rejected", async () => {
    await assertFails(set(ref(db("admin"), "adminLog/e1"), entry({
      changes: [{ path: "config/x", before: "1", after: "2", extra: "no" }],
    })));
  });
});

describe("why score deletes are not undoable", () => {
  /**
   * enteredBy is pinned to auth.uid — that is where "a judge cannot file under
   * another judge" lives. So restoring a deleted card is impossible for anyone
   * but its original author, which is why dangerZone marks score deletes
   * undoable:false and re-entry goes through PaperScoreDialog instead.
   */
  test("an admin cannot restore a card another admin entered", async () => {
    await assertFails(
      set(ref(db("admin"), "scores/first/team2/judge2"),
        scoreCard({ judgeUid: "judge2", teamId: "team2", enteredBy: "someone-else" }))
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:rules`
Expected: FAIL — the "what an entry may contain" cases that should be rejected all pass instead, because no `/adminLog` rule exists and the root admin rule permits anything.

- [ ] **Step 3: Add the rules block**

In `database.rules.json`, add as a sibling immediately after the closing brace of the `"scores"` block:

```json
    // Who changed what, from the admin control panel. Rules cascade, so the
    // root admin grant above already covers read and write here; this block
    // only pins the shape. It is not tamper-proof — an admin can delete
    // entries, and deletes skip .validate. It is a forensics aid, not a ledger.
    "adminLog": {
      "$entryId": {
        ".validate": "newData.hasChildren(['at','by','action','summary'])",

        "at":       { ".validate": "newData.isNumber() && newData.val() <= now" },

        // Pinned to the caller, the same way enteredBy is on a score card, so
        // one admin cannot write history under another admin's name.
        "by":       { ".validate": "newData.val() === auth.uid" },

        "byName":   { ".validate": "newData.isString() && newData.val().length <= 120" },
        "action":   { ".validate": "newData.isString() && newData.val().length <= 64" },
        "summary":  { ".validate": "newData.isString() && newData.val().length <= 500" },
        "undoable": { ".validate": "newData.isBoolean()" },

        // before/after are JSON strings, not live values: RTDB drops nulls on
        // write, so a literal null before-value would vanish and undo would
        // restore the wrong thing.
        "changes": {
          "$i": {
            ".validate": "newData.hasChild('path')",
            "path":   { ".validate": "newData.isString() && newData.val().length <= 300" },
            "before": { ".validate": "newData.isString()" },
            "after":  { ".validate": "newData.isString()" },
            "$other": { ".validate": false }
          }
        },

        "undone": {
          "at":     { ".validate": "newData.isNumber() && newData.val() <= now" },
          "by":     { ".validate": "newData.val() === auth.uid" },
          "$other": { ".validate": false }
        },

        "$other": { ".validate": false }
      }
    },
```

- [ ] **Step 4: Run the rules test to verify it passes**

Run: `npm run test:rules`
Expected: PASS, all cases.

- [ ] **Step 5: Bump the drift guard**

Run: `npm run test:ci -- -t "the version marker matches the rules"`
Expected: FAIL, printing the new digest.

In `database.rules.json` line 1, change `// rulesVersion: 2` to `// rulesVersion: 3`. In `src/schema.test.js`, set `EXPECTED_VERSION = 3` and paste the printed digest into `EXPECTED_DIGEST`.

Then add this test inside the existing `describe("a judge cannot grant themselves an assignment", ...)` file, as a new top-level describe:

```js
describe("the audit log pins its author", () => {
  test("by is compared to auth.uid, so entries cannot be forged", () => {
    expect(RULES.rules.adminLog.$entryId.by[".validate"]).toContain("auth.uid");
  });

  test("unknown keys are refused at both levels", () => {
    expect(RULES.rules.adminLog.$entryId.$other[".validate"]).toBe(false);
    expect(RULES.rules.adminLog.$entryId.changes.$i.$other[".validate"]).toBe(false);
  });
});
```

- [ ] **Step 6: Run the full unit suite**

Run: `npm run test:ci`
Expected: PASS.

> **This does not make the rules live.** Nothing in this repo deploys them. Republish `database.rules.json` in the Firebase console (Realtime Database → Rules) before the event. Until then `/adminLog` writes still succeed via the root admin rule — just unvalidated — so development is not blocked.

- [ ] **Step 7: Commit**

```bash
git add database.rules.json src/schema.test.js test/rules/adminLog.test.mjs
git commit -m "Pin the shape of the admin audit log"
```

---

### Task 2: The `applyAdminAction` primitive

**Files:**
- Create: `src/user/admin/adminAction.js`
- Test: `src/user/admin/adminAction.test.js`

**Interfaces:**
- Consumes: `requireAdmin(action)` from `src/roles.js` (throws if not admin, returns the firebase user)
- Produces:
  - `UNDO_SIZE_CAP = 50000`
  - `encodeChanges(changes) -> [{path, before: string, after: string}]`
  - `decodeChanges(raw) -> [{path, before: any, after: any}]`
  - `captureBefore(paths: string[]) -> Promise<{[path]: any}>`
  - `applyAdminAction({action, summary, changes, undoable=true}) -> Promise<{ok, entryId} | {ok:false, error}>`

- [ ] **Step 1: Write the failing test**

Create `src/user/admin/adminAction.test.js`:

```js
/**
 * The primitive every admin write goes through.
 *
 * The property that matters: the change and its log entry are in ONE update
 * call. Two calls would let a change land with no record of it, which is
 * exactly the situation the log exists to explain.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));

const mockUpdate = jest.fn(async () => {});
const mockGet = jest.fn(async () => ({ exists: () => false, val: () => null }));

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "entry-1" }),
  serverTimestamp: () => 1700000000000,
}));

jest.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { uid: "admin-1" } }),
}));

jest.mock("../../roles.js", () => ({
  requireAdmin: jest.fn(async () => ({ uid: "admin-1" })),
}));

const {
  encodeChanges,
  decodeChanges,
  applyAdminAction,
  UNDO_SIZE_CAP,
} = require("./adminAction");

const { requireAdmin } = require("../../roles.js");

/**
 * create-react-app sets `resetMocks: true`, which strips the implementation off
 * every jest.fn before each test -- so an implementation passed to jest.fn() at
 * declaration is gone by the time the first test runs and the mock silently
 * returns undefined. Every implementation has to be re-established here.
 */
beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

describe("encoding survives what Realtime Database does to values", () => {
  test("null round-trips, because RTDB drops a literal null on write", () => {
    const [encoded] = encodeChanges([{ path: "a/b", before: null, after: 3 }]);
    expect(encoded.before).toBe("null");
    expect(decodeChanges([encoded])[0].before).toBeNull();
  });

  test("objects and arrays round-trip", () => {
    const changes = [{ path: "config/judgingRooms", before: ["A", "B"], after: ["A"] }];
    expect(decodeChanges(encodeChanges(changes))).toEqual(changes);
  });

  test("false and empty string are preserved, not treated as absent", () => {
    const changes = [{ path: "t/submitted", before: true, after: false }];
    expect(decodeChanges(encodeChanges(changes))[0].after).toBe(false);
  });
});

describe("the change and its log entry land together", () => {
  test("one update call carries both", async () => {
    const result = await applyAdminAction({
      action: "team.rename",
      summary: "Alpha to Omega",
      changes: [{ path: "teams/t1/name", before: "Alpha", after: "Omega" }],
    });

    expect(result.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    const payload = mockUpdate.mock.calls[0][1];
    expect(payload["teams/t1/name"]).toBe("Omega");
    expect(payload["adminLog/entry-1"]).toMatchObject({
      action: "team.rename",
      by: "admin-1",
      undoable: true,
    });
  });

  test("the entry records the author, never a caller-supplied one", async () => {
    await applyAdminAction({ action: "x", summary: "y", changes: [] });
    expect(mockUpdate.mock.calls[0][1]["adminLog/entry-1"].by).toBe("admin-1");
  });

  test("an oversized change-set logs counts only and refuses undo", async () => {
    const big = Array.from({ length: 400 }, (_, i) => ({
      path: `teams/t${i}/schedule`,
      before: { room: "Rice 110", notes: "x".repeat(200) },
      after: null,
    }));

    await applyAdminAction({ action: "schedule.clear", summary: "cleared", changes: big });

    const entry = mockUpdate.mock.calls[0][1]["adminLog/entry-1"];
    expect(entry.undoable).toBe(false);
    expect(entry.changes).toBeUndefined();
    expect(entry.summary).toContain("400");
    // the changes themselves are still applied — only the record is trimmed
    expect(mockUpdate.mock.calls[0][1]["teams/t0/schedule"]).toBeNull();
  });

  test("the cap is a byte budget, not a count", () => {
    expect(UNDO_SIZE_CAP).toBe(50000);
  });
});

describe("failure is returned, never thrown", () => {
  test("a rejected write comes back as { ok: false }", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("PERMISSION_DENIED"));
    const result = await applyAdminAction({ action: "x", summary: "y", changes: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("PERMISSION_DENIED");
  });

  test("a non-admin caller comes back as { ok: false }", async () => {
    const { requireAdmin } = require("../../roles.js");
    requireAdmin.mockRejectedValueOnce(new Error("Only an organiser can x"));
    const result = await applyAdminAction({ action: "x", summary: "y", changes: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Only an organiser");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/adminAction.test.js`
Expected: FAIL — "Cannot find module './adminAction'".

- [ ] **Step 3: Write the implementation**

Create `src/user/admin/adminAction.js`:

```js
import { ref, get, update, push, serverTimestamp } from "firebase/database";
import { database } from "../../firebase.js";
import { requireAdmin } from "../../roles.js";

/**
 * Every write the control panel makes goes through here.
 *
 * The one property worth protecting: the change and the entry describing it go
 * into the SAME multi-path update, which Realtime Database applies atomically.
 * Two separate writes would let a change land with no record on a dropped
 * connection — precisely the state you would be trying to explain afterwards.
 *
 * This is a forensics aid, not a ledger. Admins hold root write and deletes
 * skip validation, so entries can be erased. It answers "what did we change at
 * 4:52", not "prove nobody tampered".
 */

/**
 * Above this many bytes of serialised before/after, the entry keeps counts
 * only. Clearing a whole schedule captures every team's slot plus every
 * judge's copy — of the order of 100 KB — and that is not worth storing to
 * make undoable something a regeneration rebuilds anyway.
 */
export const UNDO_SIZE_CAP = 50000;

/**
 * before/after are stored as JSON strings.
 *
 * RTDB drops null values on write, so a literal `before: null` — meaning the
 * field did not exist — would silently vanish from the entry and undo would
 * restore the wrong thing. A string survives, and it collapses the .validate
 * for these fields to isString().
 */
export function encodeChanges(changes) {
  return changes.map(({ path, before, after }) => ({
    path,
    before: JSON.stringify(before ?? null),
    after: JSON.stringify(after ?? null),
  }));
}

export function decodeChanges(raw) {
  const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  return list.map(({ path, before, after }) => ({
    path,
    before: JSON.parse(before ?? "null"),
    after: JSON.parse(after ?? "null"),
  }));
}

/** Read the current value at each path, so the entry can carry a before-state. */
export async function captureBefore(paths) {
  const entries = await Promise.all(
    paths.map(async (path) => {
      const snap = await get(ref(database, path));
      return [path, snap.exists() ? snap.val() : null];
    })
  );
  return Object.fromEntries(entries);
}

/** Best-effort display name for the acting admin; the uid is the fallback. */
async function resolveName(uid) {
  for (const role of ["judges", "competitors"]) {
    try {
      const snap = await get(ref(database, `${role}/${uid}`));
      if (snap.exists()) {
        const person = snap.val();
        const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
        if (name) return name;
      }
    } catch {
      // an admin who is neither a judge nor a competitor is normal
    }
  }
  return `admin ${uid.slice(0, 8)}`;
}

export async function applyAdminAction({ action, summary, changes = [], undoable = true }) {
  let admin;
  try {
    admin = await requireAdmin(action);
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    const encoded = encodeChanges(changes);
    const tooBig = JSON.stringify(encoded).length > UNDO_SIZE_CAP;

    const entry = {
      at: serverTimestamp(),
      by: admin.uid,
      byName: await resolveName(admin.uid),
      action,
      summary: tooBig ? `${summary} (${changes.length} paths, too large to undo)` : summary,
      undoable: undoable && !tooBig,
    };
    if (!tooBig) entry.changes = encoded;

    const entryId = push(ref(database, "adminLog")).key;

    const updates = {};
    for (const { path, after } of changes) updates[path] = after ?? null;
    updates[`adminLog/${entryId}`] = entry;

    await update(ref(database), updates);
    return { ok: true, entryId };
  } catch (error) {
    console.error(`Admin action ${action} failed:`, error);
    return { ok: false, error: error.message || "The change could not be saved." };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/adminAction.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/user/admin/adminAction.js src/user/admin/adminAction.test.js
git commit -m "Put every admin change and its audit entry in one update"
```

---

### Task 3: Undo, with a drift check

**Files:**
- Modify: `src/user/admin/adminAction.js` (add `undoAdminAction`, `reverseChanges`, `findDrift`)
- Modify: `src/user/admin/adminAction.test.js` (append)

**Interfaces:**
- Consumes: `decodeChanges`, `applyAdminAction`, `captureBefore` from Task 2
- Produces:
  - `reverseChanges(changes) -> changes[]` (pure — swaps before/after)
  - `findDrift(changes, current) -> {path, expected, actual} | null` (pure)
  - `undoAdminAction(entryId) -> Promise<{ok, entryId} | {ok:false, error}>`

- [ ] **Step 1: Write the failing test**

Append to `src/user/admin/adminAction.test.js`:

```js
const { reverseChanges, findDrift, undoAdminAction } = require("./adminAction");

describe("reversing a change-set", () => {
  test("before and after swap", () => {
    expect(reverseChanges([{ path: "a", before: 1, after: 2 }]))
      .toEqual([{ path: "a", before: 2, after: 1 }]);
  });

  test("a create reverses into a delete", () => {
    expect(reverseChanges([{ path: "a", before: null, after: { x: 1 } }]))
      .toEqual([{ path: "a", before: { x: 1 }, after: null }]);
  });
});

describe("the drift check", () => {
  /**
   * Undo restores a captured value. If someone else edited the same path since,
   * a naive undo silently discards their work — so it refuses instead, and says
   * which path moved.
   */
  test("passes when nothing moved", () => {
    const changes = [{ path: "teams/t1/name", before: "Alpha", after: "Omega" }];
    expect(findDrift(changes, { "teams/t1/name": "Omega" })).toBeNull();
  });

  test("catches a later edit and names the path", () => {
    const changes = [{ path: "teams/t1/name", before: "Alpha", after: "Omega" }];
    const drift = findDrift(changes, { "teams/t1/name": "Something Else" });
    expect(drift.path).toBe("teams/t1/name");
    expect(drift.actual).toBe("Something Else");
  });

  test("compares structurally, not by reference", () => {
    const changes = [{ path: "config/judgingRooms", before: ["A"], after: ["A", "B"] }];
    expect(findDrift(changes, { "config/judgingRooms": ["A", "B"] })).toBeNull();
  });

  test("an absent path matches a null after-value", () => {
    const changes = [{ path: "teams/t1/schedule", before: { room: "A" }, after: null }];
    expect(findDrift(changes, { "teams/t1/schedule": null })).toBeNull();
  });
});

describe("undoing an entry", () => {
  const logged = {
    action: "team.rename",
    summary: "Alpha to Omega",
    undoable: true,
    changes: [{ path: "teams/t1/name", before: '"Alpha"', after: '"Omega"' }],
  };

  function whenLogSays(entry, currentValues = {}) {
    mockGet.mockImplementation(async (r) => {
      if (r.path.startsWith("adminLog/")) {
        return { exists: () => Boolean(entry), val: () => entry };
      }
      const value = currentValues[r.path];
      return { exists: () => value !== undefined, val: () => value };
    });
  }

  test("applies the reverse and marks the original undone", async () => {
    whenLogSays(logged, { "teams/t1/name": "Omega" });

    const result = await undoAdminAction("entry-0");
    expect(result.ok).toBe(true);

    const payload = mockUpdate.mock.calls[0][1];
    expect(payload["teams/t1/name"]).toBe("Alpha");
    expect(payload["adminLog/entry-0/undone"]).toMatchObject({ by: "admin-1" });
  });

  test("the undo is itself logged", async () => {
    whenLogSays(logged, { "teams/t1/name": "Omega" });
    await undoAdminAction("entry-0");
    expect(mockUpdate.mock.calls[0][1]["adminLog/entry-1"].action).toBe("undo:team.rename");
  });

  test("refuses when the value moved since, naming the path", async () => {
    whenLogSays(logged, { "teams/t1/name": "Edited By Someone Else" });

    const result = await undoAdminAction("entry-0");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("teams/t1/name");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("refuses an entry marked not undoable", async () => {
    whenLogSays({ ...logged, undoable: false });
    const result = await undoAdminAction("entry-0");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot be undone/i);
  });

  test("refuses an entry already undone", async () => {
    whenLogSays({ ...logged, undone: { at: 1, by: "admin-2" } });
    const result = await undoAdminAction("entry-0");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already undone/i);
  });

  test("refuses an entry that is not there", async () => {
    whenLogSays(null);
    const result = await undoAdminAction("missing");
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/adminAction.test.js`
Expected: FAIL — `reverseChanges is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/user/admin/adminAction.js`:

```js
/** Swap before and after. A create reverses into a delete and vice versa. */
export function reverseChanges(changes) {
  return changes.map(({ path, before, after }) => ({ path, before: after, after: before }));
}

/**
 * Has anything moved since the entry was written?
 *
 * Undo restores a captured value, so if a later edit touched the same path an
 * unguarded undo would silently discard it. Structural comparison via JSON: the
 * values came out of the database, so they are plain JSON already.
 */
export function findDrift(changes, current) {
  for (const { path, after } of changes) {
    const now = current[path] ?? null;
    if (JSON.stringify(now) !== JSON.stringify(after ?? null)) {
      return { path, expected: after ?? null, actual: now };
    }
  }
  return null;
}

export async function undoAdminAction(entryId) {
  let entry;
  try {
    const snap = await get(ref(database, `adminLog/${entryId}`));
    if (!snap.exists()) return { ok: false, error: "That log entry no longer exists." };
    entry = snap.val();
  } catch (error) {
    return { ok: false, error: error.message || "Could not read that log entry." };
  }

  if (entry.undone) {
    return { ok: false, error: "That change has already been undone." };
  }
  if (entry.undoable === false || !entry.changes) {
    return { ok: false, error: "That change cannot be undone. It was too large to record in full." };
  }

  const changes = decodeChanges(entry.changes);

  let current;
  try {
    current = await captureBefore(changes.map((change) => change.path));
  } catch (error) {
    return { ok: false, error: error.message || "Could not check the current values." };
  }

  const drift = findDrift(changes, current);
  if (drift) {
    return {
      ok: false,
      error:
        `${drift.path} has changed since this action, so undoing it would discard ` +
        `that edit. Nothing was changed.`,
      drift,
    };
  }

  let actingUid;
  try {
    actingUid = (await requireAdmin("undo a change")).uid;
  } catch (error) {
    return { ok: false, error: error.message };
  }

  // The undo goes through applyAdminAction, so it is logged like anything else,
  // and marking the original happens in the same atomic update as the reversal.
  return applyAdminAction({
    action: `undo:${entry.action}`,
    summary: `Undid: ${entry.summary}`,
    changes: [
      ...reverseChanges(changes),
      {
        path: `adminLog/${entryId}/undone`,
        before: null,
        after: { at: serverTimestamp(), by: actingUid },
      },
    ],
    undoable: false,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/adminAction.test.js`
Expected: PASS, all cases in both describes.

- [ ] **Step 5: Commit**

```bash
git add src/user/admin/adminAction.js src/user/admin/adminAction.test.js
git commit -m "Undo an admin change, refusing when the value has moved"
```

---

## Phase 2 — Domain services

Tasks 4–8 are independent of each other. Each consumes only Task 2/3.

### Task 4: Rooms — in-use detection and remap

**Files:**
- Create: `src/user/admin/roomsService.js`
- Test: `src/user/admin/roomsService.test.js`

**Interfaces:**
- Consumes: `applyAdminAction`, `captureBefore` (Task 2); `assignmentList` from `src/user/judge/assignmentList.js`; `DEFAULT_ROOMS` from `src/user/judge/getJudgeSchedule.js`
- Produces:
  - `roomsInUse(teamsData) -> {[room]: Array<{teamId, teamName, time, batch}>}` (pure)
  - `remapChanges({from, to, teamsData, judgesData}) -> changes[]` (pure)
  - `listRooms() -> Promise<string[]>`
  - `addRoom(name) -> Promise<{ok, error}>`
  - `renameRoom(from, to) -> Promise<{ok, error}>`
  - `removeRoom(name, {moveTo}) -> Promise<{ok, error, inUse}>`

- [ ] **Step 1: Write the failing test**

Create `src/user/admin/roomsService.test.js`:

```js
/**
 * Rooms.
 *
 * config/judgingRooms and a generated schedule are separate stores: the config
 * feeds the NEXT generation, while a schedule already written holds the room
 * name copied into teams/{id}/schedule and into every assigned judge's own
 * copy. Removing a room therefore has to touch all of them or none.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));
jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: jest.fn(async () => ({ exists: () => false, val: () => null })),
  update: jest.fn(async () => {}),
  push: () => ({ key: "entry-1" }),
  serverTimestamp: () => 0,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const { roomsInUse, remapChanges } = require("./roomsService");

const teamsData = {
  t1: { name: "Lumen", schedule: { id: "t1", teamName: "Lumen", room: "Rice 110", time: "5:00 PM", batch: 1, judges: [{ judgeId: "j1", judgeName: "Ada" }, { judgeId: "j2", judgeName: "Bo" }] } },
  t2: { name: "Northstar", schedule: { id: "t2", teamName: "Northstar", room: "Rice 110", time: "5:15 PM", batch: 2, judges: [{ judgeId: "j1", judgeName: "Ada" }] } },
  t3: { name: "Verdant", schedule: { id: "t3", teamName: "Verdant", room: "Rice 204", time: "5:00 PM", batch: 1, judges: [{ judgeId: "j3", judgeName: "Cy" }] } },
  t4: { name: "Unscheduled" },
};

describe("which rooms a schedule is actually using", () => {
  test("groups scheduled teams by room", () => {
    const inUse = roomsInUse(teamsData);
    expect(inUse["Rice 110"].map((t) => t.teamName)).toEqual(["Lumen", "Northstar"]);
    expect(inUse["Rice 204"]).toHaveLength(1);
  });

  test("a team with no schedule is not counted", () => {
    expect(Object.values(roomsInUse(teamsData)).flat().map((t) => t.teamId)).not.toContain("t4");
  });

  test("carries the time and batch, so the dialog can list them usefully", () => {
    expect(roomsInUse(teamsData)["Rice 110"][0]).toMatchObject({ time: "5:00 PM", batch: 1 });
  });

  test("no schedule at all is an empty map, not a crash", () => {
    expect(roomsInUse(null)).toEqual({});
    expect(roomsInUse({ t1: {} })).toEqual({});
  });
});

describe("remapping every copy of a room", () => {
  /**
   * An assignment is stored twice on purpose — teams/{id}/schedule and
   * judges/{uid}/teamAssignments/{id} — so a judge can read their own list
   * without read access to every team. Both copies must move together.
   */
  const judgesData = {
    j1: { teamAssignments: { t1: { ...teamsData.t1.schedule }, t2: { ...teamsData.t2.schedule } } },
    j2: { teamAssignments: { t1: { ...teamsData.t1.schedule } } },
    j3: { teamAssignments: { t3: { ...teamsData.t3.schedule } } },
  };

  test("moves the team copy for every affected team", () => {
    const changes = remapChanges({ from: "Rice 110", to: "Rice 204", teamsData, judgesData });
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c.after]));

    expect(byPath["teams/t1/schedule/room"]).toBe("Rice 204");
    expect(byPath["teams/t2/schedule/room"]).toBe("Rice 204");
    expect(byPath["teams/t3/schedule/room"]).toBeUndefined();
  });

  test("moves every judge's copy too", () => {
    const changes = remapChanges({ from: "Rice 110", to: "Rice 204", teamsData, judgesData });
    const paths = changes.map((c) => c.path);

    expect(paths).toContain("judges/j1/teamAssignments/t1/room");
    expect(paths).toContain("judges/j1/teamAssignments/t2/room");
    expect(paths).toContain("judges/j2/teamAssignments/t1/room");
    expect(paths).not.toContain("judges/j3/teamAssignments/t3/room");
  });

  test("captures the old room as the before-value, so the undo works", () => {
    const changes = remapChanges({ from: "Rice 110", to: "Rice 204", teamsData, judgesData });
    expect(changes.every((c) => c.before === "Rice 110")).toBe(true);
  });

  test("a room nothing is scheduled in produces no changes", () => {
    expect(remapChanges({ from: "Rice 999", to: "Rice 204", teamsData, judgesData })).toEqual([]);
  });

  test("a judge holding a stale assignment for a deleted team is skipped", () => {
    const stale = { j9: { teamAssignments: { gone: { room: "Rice 110" } } } };
    const changes = remapChanges({ from: "Rice 110", to: "Rice 204", teamsData, judgesData: stale });
    expect(changes.map((c) => c.path)).not.toContain("judges/j9/teamAssignments/gone/room");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/roomsService.test.js`
Expected: FAIL — "Cannot find module './roomsService'".

- [ ] **Step 3: Write the implementation**

Create `src/user/admin/roomsService.js`:

```js
import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { applyAdminAction } from "./adminAction.js";
import { DEFAULT_ROOMS } from "../judge/getJudgeSchedule.js";

/**
 * The judging room list, and what happens to a schedule when it changes.
 *
 * config/judgingRooms feeds the NEXT generation. A schedule already written
 * holds the room name copied into teams/{id}/schedule and into every assigned
 * judge's own teamAssignments — the same denormalisation assignmentEdits.js
 * works around, and for the same reason: a judge cannot read every team.
 *
 * So removing a room in use is not a list edit. It is a fan-out, and it must be
 * atomic or a team walks to one room while its judges walk to another.
 */

/** Which teams are scheduled in which room. Pure; takes a /teams snapshot. */
export function roomsInUse(teamsData) {
  const byRoom = {};
  for (const [teamId, team] of Object.entries(teamsData ?? {})) {
    const schedule = team?.schedule;
    if (!schedule?.room) continue;
    (byRoom[schedule.room] ??= []).push({
      teamId,
      teamName: schedule.teamName ?? team?.name ?? "Unnamed team",
      time: schedule.time,
      batch: schedule.batch,
    });
  }
  return byRoom;
}

/**
 * Every path that has to move when a room is renamed or vacated. Pure, so the
 * fan-out is testable without a database.
 */
export function remapChanges({ from, to, teamsData, judgesData }) {
  const affected = new Set(
    Object.entries(teamsData ?? {})
      .filter(([, team]) => team?.schedule?.room === from)
      .map(([teamId]) => teamId)
  );

  const changes = [];

  for (const teamId of affected) {
    changes.push({ path: `teams/${teamId}/schedule/room`, before: from, after: to });
  }

  for (const [judgeUid, judge] of Object.entries(judgesData ?? {})) {
    for (const teamId of Object.keys(judge?.teamAssignments ?? {})) {
      // a judge can hold an assignment for a team that no longer exists; the
      // team snapshot is the authority on what is really scheduled
      if (!affected.has(teamId)) continue;
      changes.push({
        path: `judges/${judgeUid}/teamAssignments/${teamId}/room`,
        before: from,
        after: to,
      });
    }
  }

  return changes;
}

export async function listRooms() {
  const snap = await get(ref(database, "config/judgingRooms"));
  if (!snap.exists()) return [...DEFAULT_ROOMS];
  const value = snap.val();
  const rooms = (Array.isArray(value) ? value : Object.values(value))
    .filter((room) => typeof room === "string" && room.trim().length > 0);
  return rooms.length ? rooms : [...DEFAULT_ROOMS];
}

async function loadWorld() {
  const [rooms, teamsSnap, judgesSnap] = await Promise.all([
    listRooms(),
    get(ref(database, "teams")),
    get(ref(database, "judges")),
  ]);
  return {
    rooms,
    teamsData: teamsSnap.exists() ? teamsSnap.val() : {},
    judgesData: judgesSnap.exists() ? judgesSnap.val() : {},
  };
}

export async function addRoom(name) {
  const room = String(name ?? "").trim();
  if (!room) return { ok: false, error: "Give the room a name." };

  const rooms = await listRooms();
  if (rooms.includes(room)) return { ok: false, error: `${room} is already on the list.` };

  return applyAdminAction({
    action: "room.add",
    summary: `Added ${room}`,
    changes: [{ path: "config/judgingRooms", before: rooms, after: [...rooms, room] }],
  });
}

export async function renameRoom(from, to) {
  const next = String(to ?? "").trim();
  if (!next) return { ok: false, error: "Give the room a name." };

  const { rooms, teamsData, judgesData } = await loadWorld();
  if (!rooms.includes(from)) return { ok: false, error: `${from} is not on the list.` };
  if (rooms.includes(next)) return { ok: false, error: `${next} is already on the list.` };

  const scheduled = remapChanges({ from, to: next, teamsData, judgesData });

  return applyAdminAction({
    action: "room.rename",
    summary: scheduled.length
      ? `Renamed ${from} to ${next}, moving ${scheduled.length} scheduled entries`
      : `Renamed ${from} to ${next}`,
    changes: [
      { path: "config/judgingRooms", before: rooms, after: rooms.map((r) => (r === from ? next : r)) },
      ...scheduled,
    ],
  });
}

/**
 * Removing a room. If a schedule is using it, the caller must say where those
 * teams go — refusing is better than leaving a team pointed at a room that is
 * no longer on the list.
 */
export async function removeRoom(name, { moveTo } = {}) {
  const { rooms, teamsData, judgesData } = await loadWorld();
  if (!rooms.includes(name)) return { ok: false, error: `${name} is not on the list.` };

  const inUse = roomsInUse(teamsData)[name] ?? [];

  if (inUse.length && !moveTo) {
    return {
      ok: false,
      inUse,
      error: `${inUse.length} team(s) are scheduled in ${name}. Choose where they should go.`,
    };
  }
  if (moveTo && !rooms.includes(moveTo)) {
    return { ok: false, error: `${moveTo} is not on the list.` };
  }
  if (moveTo === name) {
    return { ok: false, error: "Choose a different room to move them to." };
  }

  const moved = inUse.length ? remapChanges({ from: name, to: moveTo, teamsData, judgesData }) : [];

  return applyAdminAction({
    action: "room.remove",
    summary: moved.length
      ? `Removed ${name}, moving ${inUse.length} team(s) to ${moveTo}`
      : `Removed ${name}`,
    changes: [
      { path: "config/judgingRooms", before: rooms, after: rooms.filter((r) => r !== name) },
      ...moved,
    ],
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/roomsService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/user/admin/roomsService.js src/user/admin/roomsService.test.js
git commit -m "Move every copy of a room when the room list changes"
```

---

### Task 5: Event config, and make the scheduler read it

**Files:**
- Create: `src/user/admin/eventConfig.js`
- Modify: `src/user/judge/getJudgeSchedule.js` (add `fetchBatchConfig`, use it in `getJudgeSchedule`)
- Test: `src/user/admin/eventConfig.test.js`

**Interfaces:**
- Consumes: `applyAdminAction` (Task 2); `BATCH_COUNT`, `BATCH_TIMES` from `getJudgeSchedule.js`
- Produces:
  - `readEventConfig() -> Promise<{batchCount, batchTimes, eventStart, finalRoundRoom}>`
  - `setBatchCount(n)`, `setBatchTimes(times)`, `setEventStart(iso)`, `setFinalRoundRoom(room)` — each `-> Promise<{ok, error}>`
  - `fetchBatchConfig() -> Promise<{batchCount, batchTimes}>` exported from `getJudgeSchedule.js`

- [ ] **Step 1: Write the failing test**

Create `src/user/admin/eventConfig.test.js`:

```js
/**
 * Event configuration.
 *
 * These were module constants. They stay as fallbacks — the pattern
 * DEFAULT_ROOMS already uses — so an absent config node behaves exactly as
 * before rather than producing an event with zero batches.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));

const mockUpdate = jest.fn(async () => {});
const mockGet = jest.fn(async () => ({ exists: () => false, val: () => null }));

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "entry-1" }),
  serverTimestamp: () => 0,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const { readEventConfig, setBatchCount, setBatchTimes, setEventStart, setFinalRoundRoom } =
  require("./eventConfig");
const { BATCH_COUNT, BATCH_TIMES } = require("../judge/getJudgeSchedule");

const { requireAdmin } = require("../../roles.js");

/**
 * create-react-app sets `resetMocks: true`, which strips the implementation off
 * every jest.fn before each test -- so an implementation passed to jest.fn() at
 * declaration is gone by the time the first test runs and the mock silently
 * returns undefined. Every implementation has to be re-established here.
 */
beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

describe("reading config falls back to the built-in values", () => {
  test("an empty database gives the compiled-in defaults", async () => {
    const config = await readEventConfig();
    expect(config.batchCount).toBe(BATCH_COUNT);
    expect(config.batchTimes).toEqual(BATCH_TIMES);
    expect(config.finalRoundRoom).toBe("Rice 011");
  });

  test("stored values win", async () => {
    mockGet.mockImplementation(async (r) => {
      const stored = {
        "config/batchCount": 4,
        "config/batchTimes": { 1: "6:00 PM", 2: "6:15 PM", 3: "6:30 PM", 4: "6:45 PM" },
        "config/finalRoundRoom": "Rice 130",
        "config/eventStart": "2026-10-18T09:00:00",
      }[r.path];
      return { exists: () => stored !== undefined, val: () => stored };
    });

    const config = await readEventConfig();
    expect(config.batchCount).toBe(4);
    expect(config.batchTimes[4]).toBe("6:45 PM");
    expect(config.finalRoundRoom).toBe("Rice 130");
  });
});

describe("writing config", () => {
  test("a batch count is written and logged", async () => {
    const result = await setBatchCount(4);
    expect(result.ok).toBe(true);
    expect(mockUpdate.mock.calls[0][1]["config/batchCount"]).toBe(4);
    expect(mockUpdate.mock.calls[0][1]["adminLog/entry-1"].action).toBe("config.batchCount");
  });

  test("a batch count below one is refused", async () => {
    expect((await setBatchCount(0)).ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("a non-integer batch count is refused", async () => {
    expect((await setBatchCount(2.5)).ok).toBe(false);
  });

  test("batch times must cover every batch", async () => {
    mockGet.mockImplementation(async (r) => {
      const stored = { "config/batchCount": 3 }[r.path];
      return { exists: () => stored !== undefined, val: () => stored };
    });
    expect((await setBatchTimes({ 1: "5:00 PM", 2: "5:15 PM" })).ok).toBe(false);
  });

  test("an unparseable event start is refused", async () => {
    expect((await setEventStart("not a date")).ok).toBe(false);
  });

  test("a valid event start is written", async () => {
    const result = await setEventStart("2026-10-18T09:00:00");
    expect(result.ok).toBe(true);
    expect(mockUpdate.mock.calls[0][1]["config/eventStart"]).toBe("2026-10-18T09:00:00");
  });

  test("an empty final round room is refused", async () => {
    expect((await setFinalRoundRoom("   ")).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/eventConfig.test.js`
Expected: FAIL — "Cannot find module './eventConfig'".

- [ ] **Step 3: Write the implementation**

Create `src/user/admin/eventConfig.js`:

```js
import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { applyAdminAction } from "./adminAction.js";
import { BATCH_COUNT, BATCH_TIMES } from "../judge/getJudgeSchedule.js";
import { FINAL_ROUND_ROOM } from "../judge/finalRoundService.js";
import { EVENT_START } from "../../eventInfo.js";

/**
 * Batch count, batch times, event start and the final round room.
 *
 * All four were module constants. They remain as fallbacks — the pattern
 * DEFAULT_ROOMS already uses — so an absent config node behaves exactly as it
 * did before rather than producing an event with zero batches.
 *
 * Changing any of these affects the NEXT schedule generation. A schedule
 * already written keeps the times it was built with; that is what the room
 * remap and the per-team slot override are for.
 */

async function readOne(path, fallback) {
  try {
    const snap = await get(ref(database, path));
    return snap.exists() ? snap.val() : fallback;
  } catch {
    return fallback;
  }
}

export async function readEventConfig() {
  const [batchCount, batchTimes, eventStart, finalRoundRoom] = await Promise.all([
    readOne("config/batchCount", BATCH_COUNT),
    readOne("config/batchTimes", BATCH_TIMES),
    readOne("config/eventStart", EVENT_START),
    readOne("config/finalRoundRoom", FINAL_ROUND_ROOM),
  ]);
  return { batchCount, batchTimes, eventStart, finalRoundRoom };
}

export async function setBatchCount(count) {
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    return { ok: false, error: "The batch count must be a whole number between 1 and 12." };
  }

  const before = await readOne("config/batchCount", BATCH_COUNT);
  return applyAdminAction({
    action: "config.batchCount",
    summary: `Batch count ${before} to ${count}`,
    changes: [{ path: "config/batchCount", before, after: count }],
  });
}

export async function setBatchTimes(times) {
  const count = await readOne("config/batchCount", BATCH_COUNT);
  const missing = [];
  for (let batch = 1; batch <= count; batch++) {
    if (!String(times?.[batch] ?? "").trim()) missing.push(batch);
  }
  if (missing.length) {
    return { ok: false, error: `Give every batch a time. Missing: ${missing.join(", ")}.` };
  }

  const before = await readOne("config/batchTimes", BATCH_TIMES);
  return applyAdminAction({
    action: "config.batchTimes",
    summary: `Batch times set for ${count} batch(es)`,
    changes: [{ path: "config/batchTimes", before, after: times }],
  });
}

export async function setEventStart(iso) {
  if (Number.isNaN(new Date(iso).getTime())) {
    return { ok: false, error: "That is not a date the browser can read." };
  }

  const before = await readOne("config/eventStart", EVENT_START);
  return applyAdminAction({
    action: "config.eventStart",
    summary: `Event start ${before} to ${iso}`,
    changes: [{ path: "config/eventStart", before, after: iso }],
  });
}

export async function setFinalRoundRoom(room) {
  const next = String(room ?? "").trim();
  if (!next) return { ok: false, error: "Give the final round a room." };

  const before = await readOne("config/finalRoundRoom", FINAL_ROUND_ROOM);
  return applyAdminAction({
    action: "config.finalRoundRoom",
    summary: `Final round room ${before} to ${next}`,
    changes: [{ path: "config/finalRoundRoom", before, after: next }],
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/eventConfig.test.js`
Expected: PASS.

- [ ] **Step 5: Make the scheduler read the config**

In `src/user/judge/getJudgeSchedule.js`, add next to `fetchRooms()`:

```js
/**
 * Batch count and times, overridable at config/batchCount and
 * config/batchTimes so the day can be reshaped without a deploy. Same fallback
 * shape as fetchRooms.
 */
export async function fetchBatchConfig() {
    try {
        const [countSnap, timesSnap] = await Promise.all([
            get(ref(database, "config/batchCount")),
            get(ref(database, "config/batchTimes")),
        ]);

        const count = countSnap.exists() ? Number(countSnap.val()) : BATCH_COUNT;
        const times = timesSnap.exists() ? timesSnap.val() : BATCH_TIMES;

        return {
            batchCount: Number.isInteger(count) && count >= 1 ? count : BATCH_COUNT,
            batchTimes: times && typeof times === "object" ? times : BATCH_TIMES,
        };
    } catch (error) {
        console.warn("Could not read the batch config, using the built-in values:", error);
        return { batchCount: BATCH_COUNT, batchTimes: BATCH_TIMES };
    }
}
```

Then in `getJudgeSchedule`, extend the existing `Promise.all` and use the result:

```js
        const [judgeSnapshot, teamSnapshot, rooms, batchConfig] = await Promise.all([
            get(ref(database, "judges")),
            get(ref(database, "teams")),
            fetchRooms(),
            fetchBatchConfig(),
        ]);
```

Replace `splitIntoBatches(teamsList)` with `splitIntoBatches(teamsList, batchConfig.batchCount)`, and replace `BATCH_TIMES[batchNumber] ?? "TBD"` with `batchConfig.batchTimes[batchNumber] ?? "TBD"`.

- [ ] **Step 6: Run the scheduling tests to confirm nothing regressed**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/judge/schedule.test.js`
Expected: PASS — those tests call `splitIntoBatches` and `teamIndexFor` directly and are unaffected, which is the point of checking.

- [ ] **Step 7: Run the full suite**

Run: `npm run test:ci`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/user/admin/eventConfig.js src/user/admin/eventConfig.test.js src/user/judge/getJudgeSchedule.js
git commit -m "Move batch count, times and the final round room into config"
```

---

### Task 6: The admin list, with lockout guards

**Files:**
- Create: `src/user/admin/adminsService.js`
- Test: `src/user/admin/adminsService.test.js`

**Interfaces:**
- Consumes: `applyAdminAction` (Task 2)
- Produces:
  - `revokeGuard({uid, currentUid, adminUids}) -> string | null` (pure — the refusal reason, or null)
  - `listAdmins() -> Promise<string[]>`
  - `findPeopleByEmail(query) -> Promise<Array<{uid, name, email, roles}>>`
  - `grantAdmin({uid, name}) -> Promise<{ok, error}>`
  - `revokeAdmin(uid) -> Promise<{ok, error}>`

- [ ] **Step 1: Write the failing test**

Create `src/user/admin/adminsService.test.js`:

```js
/**
 * Who is an organiser.
 *
 * /admins is only writable by an admin, so nothing in the app can create the
 * first one — the README documents the bootstrap by hand in the Firebase
 * console. That makes emptying /admins unrecoverable from inside the app, which
 * is why revokeGuard exists and why it is a pure function with its own tests.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));

const mockUpdate = jest.fn(async () => {});
const mockGet = jest.fn(async () => ({ exists: () => false, val: () => null }));

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "entry-1" }),
  serverTimestamp: () => 0,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const { revokeGuard, grantAdmin, revokeAdmin } = require("./adminsService");

const { requireAdmin } = require("../../roles.js");

/**
 * create-react-app sets `resetMocks: true`, which strips the implementation off
 * every jest.fn before each test -- so an implementation passed to jest.fn() at
 * declaration is gone by the time the first test runs and the mock silently
 * returns undefined. Every implementation has to be re-established here.
 */
beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

describe("the two revokes that must never go through", () => {
  test("you cannot revoke yourself", () => {
    const reason = revokeGuard({ uid: "a1", currentUid: "a1", adminUids: ["a1", "a2"] });
    expect(reason).toMatch(/yourself/i);
  });

  test("you cannot revoke the last admin", () => {
    const reason = revokeGuard({ uid: "a1", currentUid: "a2", adminUids: ["a1"] });
    expect(reason).toMatch(/last/i);
  });

  test("revoking the last admin is refused even when it is not you", () => {
    expect(revokeGuard({ uid: "a1", currentUid: "a1", adminUids: ["a1"] })).not.toBeNull();
  });

  test("revoking someone else while others remain is allowed", () => {
    expect(revokeGuard({ uid: "a2", currentUid: "a1", adminUids: ["a1", "a2"] })).toBeNull();
  });

  test("revoking someone who is not an admin is refused", () => {
    expect(revokeGuard({ uid: "nobody", currentUid: "a1", adminUids: ["a1", "a2"] }))
      .toMatch(/not an organiser/i);
  });
});

describe("granting", () => {
  test("writes true at the uid and logs it", async () => {
    const result = await grantAdmin({ uid: "u9", name: "Sam Lee" });
    expect(result.ok).toBe(true);
    expect(mockUpdate.mock.calls[0][1]["admins/u9"]).toBe(true);
    expect(mockUpdate.mock.calls[0][1]["adminLog/entry-1"].summary).toContain("Sam Lee");
  });

  test("granting someone who already has it is refused", async () => {
    mockGet.mockImplementation(async (r) =>
      r.path === "admins" ? { exists: () => true, val: () => ({ u9: true }) }
                          : { exists: () => false, val: () => null });

    const result = await grantAdmin({ uid: "u9", name: "Sam Lee" });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("granting with no uid is refused", async () => {
    expect((await grantAdmin({ uid: "", name: "x" })).ok).toBe(false);
  });
});

describe("revoking", () => {
  test("removes the uid when the guards pass", async () => {
    mockGet.mockImplementation(async (r) =>
      r.path === "admins"
        ? { exists: () => true, val: () => ({ "admin-1": true, u9: true }) }
        : { exists: () => false, val: () => null });

    const result = await revokeAdmin("u9");
    expect(result.ok).toBe(true);
    expect(mockUpdate.mock.calls[0][1]["admins/u9"]).toBeNull();
  });

  test("the guard is enforced by the service, not just the UI", async () => {
    mockGet.mockImplementation(async (r) =>
      r.path === "admins"
        ? { exists: () => true, val: () => ({ "admin-1": true }) }
        : { exists: () => false, val: () => null });

    const result = await revokeAdmin("admin-1");
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/adminsService.test.js`
Expected: FAIL — "Cannot find module './adminsService'".

- [ ] **Step 3: Write the implementation**

Create `src/user/admin/adminsService.js`:

```js
import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { applyAdminAction } from "./adminAction.js";

/**
 * Who is an organiser.
 *
 * The rules give root access only to uids under /admins, and writing to
 * /admins requires being an admin already. Nothing in the app can break that
 * cycle — the README bootstraps the first one by hand in the Firebase console.
 *
 * So a revoke that empties /admins locks everyone out permanently, with no way
 * back except the console. revokeGuard is the whole reason this module exists,
 * and it is enforced here rather than in the dialog so a stale page cannot slip
 * past it.
 */

/** The reason this revoke must not happen, or null if it may. Pure. */
export function revokeGuard({ uid, currentUid, adminUids }) {
  if (!adminUids.includes(uid)) {
    return "That person is not an organiser.";
  }
  if (adminUids.length <= 1) {
    return (
      "That is the last organiser. Removing them would lock everyone out — " +
      "/admins can only be written by an admin, so nothing in the app could add one back. " +
      "Grant someone else first."
    );
  }
  if (uid === currentUid) {
    return "You cannot remove your own organiser access. Ask another organiser to do it.";
  }
  return null;
}

export async function listAdmins() {
  const snap = await get(ref(database, "admins"));
  return snap.exists() ? Object.keys(snap.val() ?? {}) : [];
}

/**
 * Find a person to promote. Granting takes someone picked from the roster
 * rather than a pasted uid, because a typo in a uid creates an admin entry that
 * belongs to nobody and can never be used or, worse, counts toward the
 * last-admin check.
 */
export async function findPeopleByEmail(query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (needle.length < 2) return [];

  const [judgesSnap, competitorsSnap] = await Promise.all([
    get(ref(database, "judges")),
    get(ref(database, "competitors")),
  ]);

  const found = new Map();
  for (const [role, snap] of [["judge", judgesSnap], ["competitor", competitorsSnap]]) {
    for (const [uid, person] of Object.entries(snap.exists() ? snap.val() ?? {} : {})) {
      const email = String(person?.email ?? "");
      const name = [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim();
      if (!email.toLowerCase().includes(needle) && !name.toLowerCase().includes(needle)) continue;

      const existing = found.get(uid);
      found.set(uid, {
        uid,
        name: name || email || uid,
        email,
        roles: [...(existing?.roles ?? []), role],
      });
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function grantAdmin({ uid, name }) {
  if (!uid) return { ok: false, error: "Pick a person first." };

  const adminUids = await listAdmins();
  if (adminUids.includes(uid)) {
    return { ok: false, error: `${name || uid} is already an organiser.` };
  }

  return applyAdminAction({
    action: "admin.grant",
    summary: `Made ${name || uid} an organiser`,
    changes: [{ path: `admins/${uid}`, before: null, after: true }],
  });
}

export async function revokeAdmin(uid, { name } = {}) {
  const [adminUids, current] = await Promise.all([
    listAdmins(),
    import("firebase/auth").then(({ getAuth }) => getAuth().currentUser?.uid ?? null),
  ]);

  const refusal = revokeGuard({ uid, currentUid: current, adminUids });
  if (refusal) return { ok: false, error: refusal };

  return applyAdminAction({
    action: "admin.revoke",
    summary: `Removed organiser access from ${name || uid}`,
    changes: [{ path: `admins/${uid}`, before: true, after: null }],
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/adminsService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/user/admin/adminsService.js src/user/admin/adminsService.test.js
git commit -m "Manage organisers without letting anyone lock everyone out"
```

---

### Task 7: Field edits and the team-rename fan-out

**Files:**
- Create: `src/user/admin/recordEdits.js`
- Test: `src/user/admin/recordEdits.test.js`

**Interfaces:**
- Consumes: `applyAdminAction`, `captureBefore` (Task 2); `memberIds` from `src/user/team/teamMembers.js`
- Produces:
  - `renameTeamChanges({teamId, from, to, teamData, judgesData}) -> changes[]` (pure)
  - `moveMemberChanges({uid, fromTeamId, toTeamId}) -> changes[]` (pure)
  - `editCompetitor(uid, fields) -> Promise<{ok, error}>`
  - `editJudge(uid, fields) -> Promise<{ok, error}>`
  - `renameTeam(teamId, name) -> Promise<{ok, error}>`
  - `moveCompetitorToTeam({uid, name, toTeamId}) -> Promise<{ok, error, emptiedTeam}>`
  - `COMPETITOR_FIELDS`, `JUDGE_FIELDS` — the editable allow-lists

- [ ] **Step 1: Write the failing test**

Create `src/user/admin/recordEdits.test.js`:

```js
/**
 * Editing a record.
 *
 * Most fields are a one-path write. A team name is not: it is copied into
 * teams/{id}/schedule.teamName and into every assigned judge's own
 * teamAssignments, because a judge cannot read the teams node. Renaming
 * without the fan-out leaves judges calling a team by a name nobody else uses.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));

const mockUpdate = jest.fn(async () => {});
const mockGet = jest.fn(async () => ({ exists: () => false, val: () => null }));

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "entry-1" }),
  serverTimestamp: () => 0,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const {
  renameTeamChanges,
  moveMemberChanges,
  editCompetitor,
  COMPETITOR_FIELDS,
} = require("./recordEdits");

const { requireAdmin } = require("../../roles.js");

/**
 * create-react-app sets `resetMocks: true`, which strips the implementation off
 * every jest.fn before each test -- so an implementation passed to jest.fn() at
 * declaration is gone by the time the first test runs and the mock silently
 * returns undefined. Every implementation has to be re-established here.
 */
beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

describe("renaming a team reaches every copy of the name", () => {
  const teamData = {
    name: "Alpha",
    schedule: { id: "t1", teamName: "Alpha", room: "Rice 110", time: "5:00 PM", batch: 1 },
  };
  const judgesData = {
    j1: { teamAssignments: { t1: { teamName: "Alpha" }, t2: { teamName: "Beta" } } },
    j2: { teamAssignments: { t1: { teamName: "Alpha" } } },
    j3: { teamAssignments: { t2: { teamName: "Beta" } } },
  };

  test("writes the team node, the schedule copy and every judge copy", () => {
    const changes = renameTeamChanges({ teamId: "t1", from: "Alpha", to: "Omega", teamData, judgesData });
    const paths = changes.map((c) => c.path);

    expect(paths).toContain("teams/t1/name");
    expect(paths).toContain("teams/t1/schedule/teamName");
    expect(paths).toContain("judges/j1/teamAssignments/t1/teamName");
    expect(paths).toContain("judges/j2/teamAssignments/t1/teamName");
  });

  test("leaves other teams alone", () => {
    const changes = renameTeamChanges({ teamId: "t1", from: "Alpha", to: "Omega", teamData, judgesData });
    expect(changes.map((c) => c.path)).not.toContain("judges/j3/teamAssignments/t2/teamName");
  });

  test("every change carries the old name, so the undo restores it", () => {
    const changes = renameTeamChanges({ teamId: "t1", from: "Alpha", to: "Omega", teamData, judgesData });
    expect(changes.every((c) => c.before === "Alpha" && c.after === "Omega")).toBe(true);
  });

  test("an unscheduled team writes only the team node", () => {
    const changes = renameTeamChanges({
      teamId: "t1", from: "Alpha", to: "Omega", teamData: { name: "Alpha" }, judgesData: {},
    });
    expect(changes.map((c) => c.path)).toEqual(["teams/t1/name"]);
  });
});

describe("moving a competitor between teams", () => {
  /**
   * Membership is a keyed set, not an array — the rules match on the child KEY.
   * Three paths have to move together or the person is on both teams, or
   * neither.
   */
  test("clears the old membership, sets the new one, and repoints the record", () => {
    const changes = moveMemberChanges({ uid: "u1", fromTeamId: "t1", toTeamId: "t2" });
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c.after]));

    expect(byPath["teams/t1/members/u1"]).toBeNull();
    expect(byPath["teams/t2/members/u1"]).toBe(true);
    expect(byPath["competitors/u1/teamId"]).toBe("t2");
  });

  test("joining from no team does not write a removal", () => {
    const paths = moveMemberChanges({ uid: "u1", fromTeamId: null, toTeamId: "t2" }).map((c) => c.path);
    expect(paths).not.toContain("teams/null/members/u1");
    expect(paths).toContain("teams/t2/members/u1");
  });

  test("leaving to no team clears the record rather than writing an empty id", () => {
    const byPath = Object.fromEntries(
      moveMemberChanges({ uid: "u1", fromTeamId: "t1", toTeamId: null }).map((c) => [c.path, c.after])
    );
    expect(byPath["competitors/u1/teamId"]).toBeNull();
    expect(byPath["teams/t1/members/u1"]).toBeNull();
  });
});

describe("editing plain fields", () => {
  test("only allow-listed fields are written", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => "old" });

    await editCompetitor("u1", { firstName: "Jane", checkedIn: true, isAdmin: true });
    const payload = mockUpdate.mock.calls[0][1];

    expect(payload["competitors/u1/firstName"]).toBe("Jane");
    expect(payload["competitors/u1/isAdmin"]).toBeUndefined();
  });

  test("check-in is editable here, because reversing one is a deliberate override", () => {
    expect(COMPETITOR_FIELDS).toContain("checkedIn");
  });

  test("an edit that changes nothing is refused rather than logged as noise", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => "Jane" });
    const result = await editCompetitor("u1", { firstName: "Jane" });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/recordEdits.test.js`
Expected: FAIL — "Cannot find module './recordEdits'".

- [ ] **Step 3: Write the implementation**

Create `src/user/admin/recordEdits.js`:

```js
import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { applyAdminAction, captureBefore } from "./adminAction.js";

/**
 * Editing a record.
 *
 * Most fields are a one-path write. A team name is not: it is copied into
 * teams/{id}/schedule.teamName and into every assigned judge's own
 * teamAssignments, because the rules do not let a judge read the teams node.
 * Renaming without the fan-out leaves judges calling a team by a name nobody
 * else uses, which on the day means a judge looking for a team that is not on
 * anyone's list.
 */

/**
 * Allow-lists. Writing an arbitrary field object straight through would let a
 * mistyped key add junk to a record the rest of the app then has to tolerate.
 */
export const COMPETITOR_FIELDS = [
  "firstName", "lastName", "email", "dietaryRestriction", "checkedIn", "foodCheckIn",
];

export const JUDGE_FIELDS = [
  "firstName", "lastName", "email", "company", "withCompany", "wantsToMentor",
  "checkedIn", "foodCheckIn", "isRound1Judge",
];

/** Every path holding a copy of this team's name. Pure. */
export function renameTeamChanges({ teamId, from, to, teamData, judgesData }) {
  const changes = [{ path: `teams/${teamId}/name`, before: from, after: to }];

  if (teamData?.schedule) {
    changes.push({ path: `teams/${teamId}/schedule/teamName`, before: from, after: to });
  }

  for (const [judgeUid, judge] of Object.entries(judgesData ?? {})) {
    if (judge?.teamAssignments?.[teamId]) {
      changes.push({
        path: `judges/${judgeUid}/teamAssignments/${teamId}/teamName`,
        before: from,
        after: to,
      });
    }
  }

  return changes;
}

/**
 * Membership is a keyed set — teams/{id}/members/{uid} = true — because the
 * rules match on the child KEY. All three paths move together or the person is
 * on both teams, or on neither.
 */
export function moveMemberChanges({ uid, fromTeamId, toTeamId }) {
  const changes = [];
  if (fromTeamId) {
    changes.push({ path: `teams/${fromTeamId}/members/${uid}`, before: true, after: null });
  }
  if (toTeamId) {
    changes.push({ path: `teams/${toTeamId}/members/${uid}`, before: null, after: true });
  }
  changes.push({
    path: `competitors/${uid}/teamId`,
    before: fromTeamId ?? null,
    after: toTeamId ?? null,
  });
  return changes;
}

async function editRecord({ node, uid, fields, allowed, label, action }) {
  const wanted = Object.entries(fields ?? {}).filter(([key]) => allowed.includes(key));
  if (!wanted.length) return { ok: false, error: "Nothing to change." };

  const paths = wanted.map(([key]) => `${node}/${uid}/${key}`);
  const before = await captureBefore(paths);

  const changes = wanted
    .map(([key, value]) => ({
      path: `${node}/${uid}/${key}`,
      before: before[`${node}/${uid}/${key}`],
      after: value,
    }))
    // an unchanged field is noise in the feed, and undoing it would be a no-op
    .filter((change) => JSON.stringify(change.before ?? null) !== JSON.stringify(change.after ?? null));

  if (!changes.length) return { ok: false, error: "Nothing changed." };

  return applyAdminAction({
    action,
    summary: `${label}: ${changes.map((c) => c.path.split("/").pop()).join(", ")}`,
    changes,
  });
}

export function editCompetitor(uid, fields) {
  return editRecord({
    node: "competitors", uid, fields,
    allowed: COMPETITOR_FIELDS, label: `Edited competitor ${uid.slice(0, 8)}`,
    action: "competitor.edit",
  });
}

export function editJudge(uid, fields) {
  return editRecord({
    node: "judges", uid, fields,
    allowed: JUDGE_FIELDS, label: `Edited judge ${uid.slice(0, 8)}`,
    action: "judge.edit",
  });
}

export async function renameTeam(teamId, name) {
  const to = String(name ?? "").trim();
  if (!to) return { ok: false, error: "Give the team a name." };

  const [teamSnap, judgesSnap] = await Promise.all([
    get(ref(database, `teams/${teamId}`)),
    get(ref(database, "judges")),
  ]);
  if (!teamSnap.exists()) return { ok: false, error: "That team no longer exists." };

  const teamData = teamSnap.val();
  const from = teamData?.name ?? null;
  if (from === to) return { ok: false, error: "That is already the name." };

  const changes = renameTeamChanges({
    teamId, from, to, teamData,
    judgesData: judgesSnap.exists() ? judgesSnap.val() : {},
  });

  return applyAdminAction({
    action: "team.rename",
    summary: `Renamed ${from ?? "an unnamed team"} to ${to}` +
      (changes.length > 1 ? ` (${changes.length - 1} denormalised copies)` : ""),
    changes,
  });
}

export async function moveCompetitorToTeam({ uid, name, toTeamId }) {
  const snap = await get(ref(database, `competitors/${uid}/teamId`));
  const fromTeamId = snap.exists() ? snap.val() : null;

  if (fromTeamId === (toTeamId ?? null)) {
    return { ok: false, error: "They are already on that team." };
  }

  // warn, do not block: an empty team is recoverable, and blocking here would
  // make the last member impossible to move
  let emptiedTeam = null;
  if (fromTeamId) {
    const membersSnap = await get(ref(database, `teams/${fromTeamId}/members`));
    const remaining = Object.keys(membersSnap.exists() ? membersSnap.val() ?? {} : {})
      .filter((memberUid) => memberUid !== uid);
    if (!remaining.length) emptiedTeam = fromTeamId;
  }

  const result = await applyAdminAction({
    action: "competitor.move",
    summary: `Moved ${name || uid.slice(0, 8)} ${fromTeamId ? `from ${fromTeamId} ` : ""}` +
      `to ${toTeamId ?? "no team"}`,
    changes: moveMemberChanges({ uid, fromTeamId, toTeamId }),
  });

  return { ...result, emptiedTeam };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/recordEdits.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/user/admin/recordEdits.js src/user/admin/recordEdits.test.js
git commit -m "Edit records, renaming a team through every copy of its name"
```

---

### Task 8: Slot overrides and destructive recovery

**Files:**
- Create: `src/user/admin/dangerZone.js`
- Test: `src/user/admin/dangerZone.test.js`

**Interfaces:**
- Consumes: `applyAdminAction`, `captureBefore` (Task 2); `FIRST_ROUND`, `FINAL_ROUND` from `src/user/judge/getTeamInfo.js`
- Produces:
  - `overrideSlotChanges({teamId, room, time, teamData, judgesData}) -> changes[]` (pure)
  - `overrideTeamSlot({teamId, room, time}) -> Promise<{ok, error}>`
  - `deleteScore({round, teamId, judgeUid, teamName, judgeName}) -> Promise<{ok, error, card}>`
  - `setTeamSubmitted({teamId, teamName, submitted}) -> Promise<{ok, error}>`
  - `clearSchedule() -> Promise<{ok, error}>`
  - `forceIntoFinalRound({teamId, teamName, room, timeslot, judgeUids}) -> Promise<{ok, error}>`

- [ ] **Step 1: Write the failing test**

Create `src/user/admin/dangerZone.test.js`:

```js
/**
 * Break-glass tooling.
 *
 * The one that needs explaining is deleteScore. A score card cannot be put
 * back: enteredBy is pinned to auth.uid by the rules, which is where "a judge
 * cannot file under another judge" lives, so a restore by anyone other than the
 * original author fails validation. Rather than weaken that rule, the delete is
 * marked not-undoable and the card is returned so the caller can re-enter it
 * through the existing paper-score dialog.
 */
jest.mock("../../firebase", () => ({ database: {}, auth: {} }));

const mockUpdate = jest.fn(async () => {});
const mockGet = jest.fn(async () => ({ exists: () => false, val: () => null }));

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: (...args) => mockGet(...args),
  update: (...args) => mockUpdate(...args),
  push: () => ({ key: "entry-1" }),
  serverTimestamp: () => 0,
}));
jest.mock("firebase/auth", () => ({ getAuth: () => ({ currentUser: { uid: "admin-1" } }) }));
jest.mock("../../roles.js", () => ({ requireAdmin: jest.fn(async () => ({ uid: "admin-1" })) }));

const {
  overrideSlotChanges,
  deleteScore,
  setTeamSubmitted,
  clearSchedule,
} = require("./dangerZone");

const { requireAdmin } = require("../../roles.js");

/**
 * create-react-app sets `resetMocks: true`, which strips the implementation off
 * every jest.fn before each test -- so an implementation passed to jest.fn() at
 * declaration is gone by the time the first test runs and the mock silently
 * returns undefined. Every implementation has to be re-established here.
 */
beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue(undefined);
  mockGet.mockReset();
  mockGet.mockResolvedValue({ exists: () => false, val: () => null });
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue({ uid: "admin-1" });
});

describe("overriding one team's slot", () => {
  const teamData = {
    schedule: { id: "t1", teamName: "Lumen", room: "Rice 110", time: "5:00 PM", batch: 1 },
  };
  const judgesData = {
    j1: { teamAssignments: { t1: { room: "Rice 110", time: "5:00 PM" } } },
    j2: { teamAssignments: { t1: { room: "Rice 110", time: "5:00 PM" } } },
    j3: { teamAssignments: { t2: { room: "Rice 204", time: "5:00 PM" } } },
  };

  test("moves the team copy and every assigned judge's copy", () => {
    const changes = overrideSlotChanges({
      teamId: "t1", room: "Rice 204", time: "5:45 PM", teamData, judgesData,
    });
    const paths = changes.map((c) => c.path);

    expect(paths).toContain("teams/t1/schedule/room");
    expect(paths).toContain("teams/t1/schedule/time");
    expect(paths).toContain("judges/j1/teamAssignments/t1/room");
    expect(paths).toContain("judges/j2/teamAssignments/t1/time");
    expect(paths).not.toContain("judges/j3/teamAssignments/t2/room");
  });

  test("only writes the field that actually changed", () => {
    const changes = overrideSlotChanges({
      teamId: "t1", room: "Rice 110", time: "5:45 PM", teamData, judgesData,
    });
    expect(changes.map((c) => c.path)).not.toContain("teams/t1/schedule/room");
    expect(changes.map((c) => c.path)).toContain("teams/t1/schedule/time");
  });

  test("a team with no schedule yields nothing to change", () => {
    expect(overrideSlotChanges({
      teamId: "t1", room: "A", time: "B", teamData: {}, judgesData,
    })).toEqual([]);
  });
});

describe("deleting a score", () => {
  const card = {
    problem: 8, innovation: 7, impact: 9, viability: 4, pitch_quality: 4,
    fundable: true, judgeUid: "j1", teamId: "t1", enteredBy: "j1", submittedAt: 1,
  };

  test("removes the card and returns it for re-entry", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => card });

    const result = await deleteScore({
      round: "first", teamId: "t1", judgeUid: "j1", teamName: "Lumen", judgeName: "Ada",
    });

    expect(result.ok).toBe(true);
    expect(result.card).toEqual(card);
    expect(mockUpdate.mock.calls[0][1]["scores/first/t1/j1"]).toBeNull();
  });

  test("is marked not undoable, because enteredBy is pinned to auth.uid", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => card });
    await deleteScore({ round: "first", teamId: "t1", judgeUid: "j1" });
    expect(mockUpdate.mock.calls[0][1]["adminLog/entry-1"].undoable).toBe(false);
  });

  test("the whole card is kept in the entry so it can be re-typed", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => card });
    await deleteScore({ round: "first", teamId: "t1", judgeUid: "j1" });

    const logged = mockUpdate.mock.calls[0][1]["adminLog/entry-1"];
    expect(JSON.parse(logged.changes[0].before)).toEqual(card);
  });

  test("a card that is not there is refused", async () => {
    const result = await deleteScore({ round: "first", teamId: "t1", judgeUid: "j1" });
    expect(result.ok).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("an unknown round is refused", async () => {
    expect((await deleteScore({ round: "middle", teamId: "t1", judgeUid: "j1" })).ok).toBe(false);
  });
});

describe("un-submitting a team", () => {
  test("flips the flag and logs it", async () => {
    mockGet.mockResolvedValue({ exists: () => true, val: () => true });
    const result = await setTeamSubmitted({ teamId: "t1", teamName: "Lumen", submitted: false });

    expect(result.ok).toBe(true);
    expect(mockUpdate.mock.calls[0][1]["teams/t1/submitted"]).toBe(false);
  });
});

describe("clearing the schedule", () => {
  test("nulls every team schedule and every judge assignment", async () => {
    mockGet.mockImplementation(async (r) => {
      if (r.path === "teams") {
        return { exists: () => true, val: () => ({ t1: { schedule: { room: "A" } }, t2: {} }) };
      }
      if (r.path === "judges") {
        return { exists: () => true, val: () => ({ j1: { teamAssignments: { t1: {} } }, j2: {} }) };
      }
      return { exists: () => false, val: () => null };
    });

    const result = await clearSchedule();
    expect(result.ok).toBe(true);

    const payload = mockUpdate.mock.calls[0][1];
    expect(payload["teams/t1/schedule"]).toBeNull();
    expect(payload["judges/j1/teamAssignments"]).toBeNull();
    expect(payload["config/scheduleMeta"]).toBeNull();
  });

  test("refuses when there is no schedule to clear", async () => {
    const result = await clearSchedule();
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/dangerZone.test.js`
Expected: FAIL — "Cannot find module './dangerZone'".

- [ ] **Step 3: Write the implementation**

Create `src/user/admin/dangerZone.js`:

```js
import { ref, get } from "firebase/database";
import { database } from "../../firebase.js";
import { applyAdminAction, captureBefore } from "./adminAction.js";
import { FIRST_ROUND, FINAL_ROUND } from "../judge/getTeamInfo.js";

/**
 * Break-glass tooling: the things you reach for when something has already
 * gone wrong.
 *
 * deleteScore is the one that needs explaining. A card cannot be put back:
 * enteredBy is pinned to auth.uid by the rules, and that pin is where the
 * "a judge cannot file under another judge" guarantee lives. Restoring one as a
 * different admin would fail validation, and weakening the rule to allow it
 * would cost more than the undo is worth. So the delete is marked not-undoable
 * and the card is handed back, for the caller to re-enter through the paper
 * score dialog — which stamps the correct new provenance.
 */

/** Every path holding this team's room and time. Pure. */
export function overrideSlotChanges({ teamId, room, time, teamData, judgesData }) {
  const schedule = teamData?.schedule;
  if (!schedule) return [];

  const fields = [];
  if (room && room !== schedule.room) fields.push(["room", schedule.room, room]);
  if (time && time !== schedule.time) fields.push(["time", schedule.time, time]);
  if (!fields.length) return [];

  const changes = fields.map(([field, before, after]) => ({
    path: `teams/${teamId}/schedule/${field}`,
    before,
    after,
  }));

  for (const [judgeUid, judge] of Object.entries(judgesData ?? {})) {
    if (!judge?.teamAssignments?.[teamId]) continue;
    for (const [field, before, after] of fields) {
      changes.push({
        path: `judges/${judgeUid}/teamAssignments/${teamId}/${field}`,
        before,
        after,
      });
    }
  }

  return changes;
}

export async function overrideTeamSlot({ teamId, teamName, room, time }) {
  const [teamSnap, judgesSnap] = await Promise.all([
    get(ref(database, `teams/${teamId}`)),
    get(ref(database, "judges")),
  ]);
  if (!teamSnap.exists()) return { ok: false, error: "That team no longer exists." };

  const changes = overrideSlotChanges({
    teamId, room, time,
    teamData: teamSnap.val(),
    judgesData: judgesSnap.exists() ? judgesSnap.val() : {},
  });

  if (!changes.length) {
    return { ok: false, error: "Nothing changed. Generate a schedule first if there is none." };
  }

  return applyAdminAction({
    action: "team.slot",
    summary: `Moved ${teamName || teamId} to ${room} at ${time}`,
    changes,
  });
}

export async function deleteScore({ round, teamId, judgeUid, teamName, judgeName }) {
  if (round !== FIRST_ROUND && round !== FINAL_ROUND) {
    return { ok: false, error: `Unknown round "${round}".` };
  }

  const path = `scores/${round}/${teamId}/${judgeUid}`;
  const snap = await get(ref(database, path));
  if (!snap.exists()) return { ok: false, error: "That score is no longer there." };

  const card = snap.val();

  const result = await applyAdminAction({
    action: "score.delete",
    summary: `Deleted the ${round} round card for ${teamName || teamId} from ${judgeName || judgeUid}`,
    changes: [{ path, before: card, after: null }],
    // enteredBy is pinned to auth.uid, so nobody but the original author could
    // write this card back. Re-entry goes through PaperScoreDialog instead.
    undoable: false,
  });

  return { ...result, card };
}

export async function setTeamSubmitted({ teamId, teamName, submitted }) {
  const before = await captureBefore([`teams/${teamId}/submitted`]);
  const was = before[`teams/${teamId}/submitted`] ?? false;

  if (Boolean(was) === Boolean(submitted)) {
    return { ok: false, error: `That team is already ${submitted ? "submitted" : "not submitted"}.` };
  }

  return applyAdminAction({
    action: "team.submitted",
    summary: `${submitted ? "Marked" : "Un-marked"} ${teamName || teamId} as submitted`,
    changes: [{ path: `teams/${teamId}/submitted`, before: was, after: Boolean(submitted) }],
  });
}

/**
 * Wipe every assignment. Regenerating is the normal path; this exists for when
 * the schedule is wrong enough that starting from nothing is clearer.
 *
 * Scores are deliberately NOT touched. They are keyed by team and judge, so
 * they survive and re-attach if the same pairing comes back — the same reason
 * getJudgeSchedule warns about stranding rather than deleting.
 */
export async function clearSchedule() {
  const [teamsSnap, judgesSnap] = await Promise.all([
    get(ref(database, "teams")),
    get(ref(database, "judges")),
  ]);

  const teamsData = teamsSnap.exists() ? teamsSnap.val() ?? {} : {};
  const judgesData = judgesSnap.exists() ? judgesSnap.val() ?? {} : {};

  const changes = [];
  for (const [teamId, team] of Object.entries(teamsData)) {
    if (team?.schedule) {
      changes.push({ path: `teams/${teamId}/schedule`, before: team.schedule, after: null });
    }
  }
  for (const [judgeUid, judge] of Object.entries(judgesData)) {
    if (judge?.teamAssignments) {
      changes.push({
        path: `judges/${judgeUid}/teamAssignments`,
        before: judge.teamAssignments,
        after: null,
      });
    }
  }

  if (!changes.length) return { ok: false, error: "There is no schedule to clear." };

  const meta = await captureBefore(["config/scheduleMeta"]);
  changes.push({
    path: "config/scheduleMeta",
    before: meta["config/scheduleMeta"],
    after: null,
  });

  return applyAdminAction({
    action: "schedule.clear",
    summary: `Cleared the schedule: ${changes.length - 1} assignment records`,
    changes,
  });
}

/**
 * Put one team into the final round by hand.
 *
 * Mirrors what activateFinalRound writes for a whole cohort: the private
 * standings entry, the team's own slot, and a copy for each final-round judge.
 * teams/{id}/finalSlot validates $other:false, so it carries room and timeslot
 * and nothing else.
 */
export async function forceIntoFinalRound({ teamId, teamName, room, timeslot, judgeUids = [] }) {
  if (!room || !timeslot) return { ok: false, error: "Give the team a room and a timeslot." };

  const paths = [
    `finalRound/teams/${teamId}`,
    `teams/${teamId}/finalSlot`,
    ...judgeUids.map((uid) => `judges/${uid}/finalAssignments/${teamId}`),
  ];
  const before = await captureBefore(paths);

  const changes = [
    {
      path: `finalRound/teams/${teamId}`,
      before: before[`finalRound/teams/${teamId}`],
      after: { teamId, name: teamName ?? "Unnamed team", addedByHand: true },
    },
    {
      path: `teams/${teamId}/finalSlot`,
      before: before[`teams/${teamId}/finalSlot`],
      after: { room, timeslot },
    },
    ...judgeUids.map((uid) => ({
      path: `judges/${uid}/finalAssignments/${teamId}`,
      before: before[`judges/${uid}/finalAssignments/${teamId}`],
      after: { teamId, teamName: teamName ?? "Unnamed team", room, timeslot },
    })),
  ];

  return applyAdminAction({
    action: "finalRound.force",
    summary: `Put ${teamName || teamId} into the final round in ${room} at ${timeslot}`,
    changes,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/dangerZone.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole suite before moving to UI**

Run: `npm run test:ci`
Expected: PASS. Every service now exists and is tested; Phase 3 only consumes them.

- [ ] **Step 6: Commit**

```bash
git add src/user/admin/dangerZone.js src/user/admin/dangerZone.test.js
git commit -m "Add slot overrides and the destructive recovery actions"
```

---

## Phase 3 — The control panel

### Task 9: Page shell, route and nav

**Files:**
- Create: `src/user/admin/Control.js`
- Create: `src/user/admin/control/EditDrawer.js`
- Modify: `src/App.js` (import + route)
- Modify: `src/siteNav.js:54-59` (`ADMIN_LINKS`)
- Modify: `src/pages.smoke.test.js` (import + test)

**Interfaces:**
- Consumes: `readEventConfig` (Task 5), `listRooms` (Task 4), `PageHeader` from `adminUi.js`
- Produces:
  - `<Control />` default export — subscribes once and passes `{config, rooms, admins, log}` to sections
  - `<EditDrawer open title onClose onSave saving error dirty>{children}</EditDrawer>` — the shell every drawer and section dialog reuses
  - Route `/user/admin/control`, admin-only

- [ ] **Step 1: Write the failing smoke test**

In `src/pages.smoke.test.js`, add the import beside the other admin page imports:

```js
import Control from "./user/admin/Control";
```

and add this test inside `describe("pages render without crashing", ...)`:

```js
  test("control panel", async () => {
    renderPage(Control, { userTypes: ["admin"] });
    expect(await screen.findByText(/control panel/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/pages.smoke.test.js`
Expected: FAIL — "Cannot find module './user/admin/Control'".

- [ ] **Step 3: Write the drawer shell**

Create `src/user/admin/control/EditDrawer.js`:

```js
import { Alert, Box, Button, Drawer, Stack, Typography } from "@mui/material";

/**
 * The shell every edit drawer and section dialog shares: a title, a scrolling
 * body, an error line and a save that is disabled until something has actually
 * changed. The dirty check is the point — an admin who opens a drawer, reads
 * it, and closes it should not produce a log entry.
 */
export default function EditDrawer({
  open,
  title,
  subtitle,
  onClose,
  onSave,
  saving = false,
  error = null,
  dirty = false,
  saveLabel = "Save",
  children,
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={saving ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, p: 3 } }}
    >
      <Stack spacing={2} sx={{ height: "100%" }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: "1.25rem" }}>{title}</Typography>
          {subtitle && <Typography variant="body2">{subtitle}</Typography>}
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto" }}>
          {children}
        </Stack>

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onClose} disabled={saving} variant="outlined">
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !dirty} variant="contained">
            {saving ? "Saving…" : saveLabel}
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}
```

- [ ] **Step 4: Write the page shell**

Create `src/user/admin/Control.js`:

```js
import { useEffect, useState } from "react";
import { Alert, Snackbar, Stack } from "@mui/material";
import { onValue, ref, query, limitToLast } from "firebase/database";
import { database } from "../../firebase";
import Layout from "../Layout";
import { PageHeader } from "./adminUi";

/**
 * Everything that had no home before: the judging rooms, the batch shape, the
 * event date, who counts as an organiser, and the actions you reach for when
 * something has gone wrong.
 *
 * One subscription lives here and the data goes down as props. Sections call
 * services and never write directly — the services put each change and its
 * audit entry into one atomic update, and the change comes back up through
 * these same subscriptions, so nothing here holds a mirror copy of state.
 */
function Control() {
  const [config, setConfig] = useState({});
  const [admins, setAdmins] = useState([]);
  const [log, setLog] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const stop = [
      onValue(ref(database, "config"), (snap) => setConfig(snap.val() ?? {})),
      onValue(ref(database, "admins"), (snap) => setAdmins(Object.keys(snap.val() ?? {}))),
      onValue(query(ref(database, "adminLog"), limitToLast(100)), (snap) => {
        const entries = Object.entries(snap.val() ?? {}).map(([id, entry]) => ({ id, ...entry }));
        // push keys are chronological, so newest-first is a reverse of key order
        setLog(entries.reverse());
      }),
    ];
    return () => stop.forEach((fn) => fn());
  }, []);

  /** Every section reports through here, so success and failure look the same. */
  const report = (result, successMessage) => {
    if (result?.ok) setToast({ severity: "success", message: successMessage });
    else setToast({ severity: "error", message: result?.error ?? "Something went wrong." });
    return result;
  };

  return (
    <Layout maxWidth="lg">
      <PageHeader
        title="Control panel"
        stats={[
          { label: "rooms", value: (config.judgingRooms ?? []).length },
          { label: "organisers", value: admins.length },
          { label: "recent changes", value: log.length },
        ]}
      />

      <Stack spacing={3}>
        {/* sections land here in Tasks 10-14 */}
      </Stack>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Layout>
  );
}

export { Control };
export default Control;
```

- [ ] **Step 5: Wire the route**

In `src/App.js`, add beside the other admin imports:

```js
import Control from "./user/admin/Control.js"
```

and add inside `<Route path="admin">`, after the `judging` route:

```jsx
            <Route path="control" element={<ProtectedRoute requiredRoles={["admin"]}><Control /></ProtectedRoute>} />
```

- [ ] **Step 6: Wire the nav**

In `src/siteNav.js`, append to `ADMIN_LINKS`:

```js
    { to: "/user/admin/control", label: "Control panel" },
```

- [ ] **Step 7: Run the smoke test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/pages.smoke.test.js`
Expected: PASS.

- [ ] **Step 8: Guard the route**

In `src/protectedRoute.test.js`, follow the existing pattern for an admin-only route and add a case asserting a competitor is redirected away from `/user/admin/control` while an admin reaches it. Match whatever helper that file already uses — do not invent a new one.

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/protectedRoute.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/user/admin/Control.js src/user/admin/control/EditDrawer.js src/App.js src/siteNav.js src/pages.smoke.test.js src/protectedRoute.test.js
git commit -m "Add the admin control panel shell behind an admin-only route"
```

---

### Task 10: Rooms section and the remap dialog

**Files:**
- Create: `src/user/admin/control/RoomsSection.js`
- Create: `src/user/admin/control/RemapDialog.js`
- Modify: `src/user/admin/Control.js` (subscribe to `/teams`, render the section)

**Interfaces:**
- Consumes: `roomsInUse`, `addRoom`, `renameRoom`, `removeRoom` (Task 4); `RowList`, `Row` from `adminUi.js`
- Produces: `<RoomsSection rooms teamsData onResult />`, `<RemapDialog room inUse rooms onClose onConfirm />`

- [ ] **Step 1: Write the remap dialog**

Create `src/user/admin/control/RemapDialog.js`:

```js
import { useState } from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
} from "@mui/material";

/**
 * Removing a room that a schedule is already using.
 *
 * config/judgingRooms feeds the NEXT generation; a schedule already written
 * holds the room name in the team's node and in every assigned judge's copy.
 * Taking the room off the list without moving those leaves a team walking to a
 * room nobody has listed, so this dialog makes the destination a required
 * choice rather than an afterthought.
 */
export default function RemapDialog({ room, inUse, rooms, busy, onClose, onConfirm }) {
  const [moveTo, setMoveTo] = useState("");
  const alternatives = rooms.filter((candidate) => candidate !== room);

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Remove {room}?</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="warning">
            {inUse.length} team{inUse.length === 1 ? " is" : "s are"} scheduled in this room.
          </Alert>

          <Stack spacing={0.5}>
            {inUse.map((team) => (
              <Typography key={team.teamId} variant="body2">
                {team.teamName} · {team.time} · batch {team.batch}
              </Typography>
            ))}
          </Stack>

          <TextField
            select
            label="Move them to"
            value={moveTo}
            onChange={(event) => setMoveTo(event.target.value)}
            helperText="The team node and every judge's copy move together."
          >
            {alternatives.map((candidate) => (
              <MenuItem key={candidate} value={candidate}>{candidate}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} variant="outlined">Cancel</Button>
        <Button
          onClick={() => onConfirm(moveTo)}
          disabled={busy || !moveTo}
          variant="contained"
          color="error"
        >
          {busy ? "Moving…" : "Remove and remap"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the rooms section**

Create `src/user/admin/control/RoomsSection.js`:

```js
import { useState } from "react";
import { Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { RowList, Row } from "../adminUi";
import { roomsInUse, addRoom, renameRoom, removeRoom } from "../roomsService";
import RemapDialog from "./RemapDialog";

/**
 * The judging room list. The scheduler assigns rooms by position within a
 * batch, so order matters at generation time; it does not matter afterwards,
 * because the name is copied into the schedule.
 */
export default function RoomsSection({ rooms, teamsData, onResult }) {
  const [newRoom, setNewRoom] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameTo, setRenameTo] = useState("");
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const inUse = roomsInUse(teamsData);

  const run = async (work, successMessage) => {
    setBusy(true);
    try {
      const result = await work();
      onResult(result, successMessage);
      return result;
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (room) => {
    const occupants = inUse[room] ?? [];
    if (occupants.length) {
      setRemoving({ room, inUse: occupants });
      return;
    }
    await run(() => removeRoom(room), `Removed ${room}`);
  };

  return (
    <section>
      <Typography variant="h2" sx={{ fontSize: "1.1rem", mb: 1 }}>Judging rooms</Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Add a room, e.g. Rice 110"
          value={newRoom}
          onChange={(event) => setNewRoom(event.target.value)}
          sx={{ flex: 1 }}
        />
        <Button
          variant="contained"
          disabled={busy || !newRoom.trim()}
          onClick={async () => {
            const result = await run(() => addRoom(newRoom), `Added ${newRoom.trim()}`);
            if (result?.ok) setNewRoom("");
          }}
        >
          Add
        </Button>
      </Stack>

      <RowList empty="No rooms configured. The scheduler will fall back to its built-in list.">
        {rooms.map((room) => {
          const occupants = inUse[room] ?? [];
          const isRenaming = renaming === room;

          return (
            <Row key={room}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                {isRenaming ? (
                  <TextField
                    size="small"
                    value={renameTo}
                    onChange={(event) => setRenameTo(event.target.value)}
                    sx={{ flex: 1 }}
                    autoFocus
                  />
                ) : (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>{room}</Typography>
                    {occupants.length > 0 && (
                      <Chip size="small" variant="outlined" label={`in use ×${occupants.length}`} />
                    )}
                  </Stack>
                )}

                <Stack direction="row" spacing={1}>
                  {isRenaming ? (
                    <>
                      <Button size="small" onClick={() => setRenaming(null)} disabled={busy}>
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={busy || !renameTo.trim()}
                        onClick={async () => {
                          const result = await run(
                            () => renameRoom(room, renameTo),
                            `Renamed ${room} to ${renameTo.trim()}`
                          );
                          if (result?.ok) setRenaming(null);
                        }}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={busy}
                        onClick={() => { setRenaming(room); setRenameTo(room); }}
                      >
                        Rename
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={busy}
                        onClick={() => handleRemove(room)}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
            </Row>
          );
        })}
      </RowList>

      {removing && (
        <RemapDialog
          room={removing.room}
          inUse={removing.inUse}
          rooms={rooms}
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={async (moveTo) => {
            const result = await run(
              () => removeRoom(removing.room, { moveTo }),
              `Removed ${removing.room}, moving ${removing.inUse.length} team(s) to ${moveTo}`
            );
            if (result?.ok) setRemoving(null);
          }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 3: Render it from the page**

In `src/user/admin/Control.js`, add the teams subscription inside the existing `useEffect` array:

```js
      onValue(ref(database, "teams"), (snap) => setTeamsData(snap.val() ?? {})),
```

add the state `const [teamsData, setTeamsData] = useState({});`, import the section, and replace the placeholder comment in the `<Stack spacing={3}>` with:

```jsx
        <RoomsSection
          rooms={config.judgingRooms ?? []}
          teamsData={teamsData}
          onResult={report}
        />
```

- [ ] **Step 4: Run the smoke test**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/pages.smoke.test.js`
Expected: PASS — the stubbed `onValue` yields no rooms, so the empty state renders.

- [ ] **Step 5: Run the whole suite**

Run: `npm run test:ci`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/user/admin/control/RoomsSection.js src/user/admin/control/RemapDialog.js src/user/admin/Control.js
git commit -m "Manage judging rooms, remapping a schedule when one is removed"
```

---

### Task 11: Schedule and event sections

**Files:**
- Create: `src/user/admin/control/ScheduleSection.js`
- Create: `src/user/admin/control/EventSection.js`
- Modify: `src/user/admin/Control.js`

**Interfaces:**
- Consumes: `setBatchCount`, `setBatchTimes`, `setFinalRoundRoom`, `setEventStart` (Task 5); `BATCH_COUNT`, `BATCH_TIMES` from `getJudgeSchedule.js`; `EVENT_START` from `eventInfo.js`
- Produces: `<ScheduleSection config onResult />`, `<EventSection config onResult />`

- [ ] **Step 1: Write the schedule section**

Create `src/user/admin/control/ScheduleSection.js`:

```js
import { useEffect, useState } from "react";
import { Alert, Button, Card, Stack, TextField, Typography } from "@mui/material";
import { setBatchCount, setBatchTimes, setFinalRoundRoom } from "../eventConfig";
import { BATCH_COUNT, BATCH_TIMES } from "../../judge/getJudgeSchedule";
import { FINAL_ROUND_ROOM } from "../../judge/finalRoundService";

/**
 * The shape of judging day.
 *
 * These were module constants and remain so as fallbacks, which is why an empty
 * config renders the built-in values rather than blanks. Everything here feeds
 * the NEXT generation — a schedule already written keeps the times it was built
 * with, and moving one team is the per-team slot override instead.
 */
export default function ScheduleSection({ config, onResult }) {
  const storedCount = config.batchCount ?? BATCH_COUNT;
  const storedTimes = config.batchTimes ?? BATCH_TIMES;
  const storedRoom = config.finalRoundRoom ?? FINAL_ROUND_ROOM;

  const [count, setCount] = useState(String(storedCount));
  const [times, setTimes] = useState(storedTimes);
  const [room, setRoom] = useState(storedRoom);
  const [busy, setBusy] = useState(false);

  // the database is the source of truth; re-sync when a write lands or another
  // admin changes it in a different tab
  useEffect(() => { setCount(String(storedCount)); }, [storedCount]);
  useEffect(() => { setTimes(storedTimes); }, [storedTimes]);
  useEffect(() => { setRoom(storedRoom); }, [storedRoom]);

  const run = async (work, message) => {
    setBusy(true);
    try {
      onResult(await work(), message);
    } finally {
      setBusy(false);
    }
  };

  const batches = Array.from({ length: Number(count) || 0 }, (_, i) => i + 1);

  return (
    <section>
      <Typography variant="h2" sx={{ fontSize: "1.1rem", mb: 1 }}>Judging schedule</Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        These take effect the next time a schedule is generated. To move a team that
        is already scheduled, use the team's own slot override.
      </Alert>

      <Card sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              size="small"
              type="number"
              label="Batches"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              inputProps={{ min: 1, max: 12 }}
              sx={{ width: 120 }}
              helperText="Teams split into this many presentation rounds"
            />
            <Button
              variant="outlined"
              disabled={busy || Number(count) === storedCount}
              onClick={() => run(
                () => setBatchCount(Number(count)),
                `Batch count set to ${count}`
              )}
              sx={{ mt: 0.5 }}
            >
              Save
            </Button>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="body2">Batch times</Typography>
            {batches.map((batch) => (
              <TextField
                key={batch}
                size="small"
                label={`Batch ${batch}`}
                value={times[batch] ?? ""}
                onChange={(event) => setTimes({ ...times, [batch]: event.target.value })}
                placeholder="5:00 PM"
              />
            ))}
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => run(() => setBatchTimes(times), "Batch times saved")}
              sx={{ alignSelf: "flex-start" }}
            >
              Save times
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              size="small"
              label="Final round room"
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              disabled={busy || room === storedRoom}
              onClick={() => run(() => setFinalRoundRoom(room), `Final round room set to ${room}`)}
              sx={{ mt: 0.5 }}
            >
              Save
            </Button>
          </Stack>
        </Stack>
      </Card>
    </section>
  );
}
```

- [ ] **Step 2: Write the event section**

Create `src/user/admin/control/EventSection.js`:

```js
import { useEffect, useState } from "react";
import { Button, Card, Stack, TextField, Typography } from "@mui/material";
import { setEventStart } from "../eventConfig";
import { EVENT_START } from "../../../eventInfo";

/**
 * The event start.
 *
 * The countdown on the home page reads config/eventStart when it is set and
 * falls back to EVENT_START in eventInfo.js, so the date can move without a
 * deploy. The input is datetime-local, which speaks the same
 * "YYYY-MM-DDTHH:mm" the constant already uses.
 */
export default function EventSection({ config, onResult }) {
  const stored = config.eventStart ?? EVENT_START;
  const [value, setValue] = useState(stored.slice(0, 16));
  const [busy, setBusy] = useState(false);

  useEffect(() => { setValue(String(stored).slice(0, 16)); }, [stored]);

  return (
    <section>
      <Typography variant="h2" sx={{ fontSize: "1.1rem", mb: 1 }}>Event</Typography>

      <Card sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <TextField
            size="small"
            type="datetime-local"
            label="Starts"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText="Drives the countdown on the home page"
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            disabled={busy || value === String(stored).slice(0, 16)}
            onClick={async () => {
              setBusy(true);
              try {
                onResult(await setEventStart(`${value}:00`), "Event start saved");
              } finally {
                setBusy(false);
              }
            }}
            sx={{ mt: 0.5 }}
          >
            Save
          </Button>
        </Stack>
      </Card>
    </section>
  );
}
```

- [ ] **Step 3: Render both from the page**

In `src/user/admin/Control.js`, import both and add after `<RoomsSection …/>`:

```jsx
        <ScheduleSection config={config} onResult={report} />
        <EventSection config={config} onResult={report} />
```

- [ ] **Step 4: Run the smoke test**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/pages.smoke.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/user/admin/control/ScheduleSection.js src/user/admin/control/EventSection.js src/user/admin/Control.js
git commit -m "Edit the batch shape, final round room and event date in the app"
```

---

### Task 12: Organisers section

**Files:**
- Create: `src/user/admin/control/AdminsSection.js`
- Modify: `src/user/admin/Control.js`

**Interfaces:**
- Consumes: `findPeopleByEmail`, `grantAdmin`, `revokeAdmin`, `revokeGuard` (Task 6); `useAuth` from `src/App.js`
- Produces: `<AdminsSection admins onResult />`

- [ ] **Step 1: Write the section**

Create `src/user/admin/control/AdminsSection.js`:

```js
import { useState } from "react";
import { Alert, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { RowList, Row } from "../adminUi";
import { useAuth } from "../../../App";
import { findPeopleByEmail, grantAdmin, revokeAdmin, revokeGuard } from "../adminsService";

/**
 * Who is an organiser.
 *
 * Granting takes a person found by email rather than a pasted uid: a mistyped
 * uid creates an admin entry belonging to nobody, which cannot be used and
 * still counts toward the last-organiser check that stops a lockout.
 *
 * The guard is enforced in the service too. This only decides what to grey out.
 */
export default function AdminsSection({ admins, onResult }) {
  const { userCredential } = useAuth();
  const currentUid = userCredential?.user?.uid ?? null;

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  const search = async (value) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    setSearching(true);
    try {
      setMatches(await findPeopleByEmail(value));
    } finally {
      setSearching(false);
    }
  };

  const run = async (work, message) => {
    setBusy(true);
    try {
      onResult(await work(), message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <Typography variant="h2" sx={{ fontSize: "1.1rem", mb: 1 }}>Organisers</Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        Only an organiser can write to /admins, so nothing in the app can create the
        first one. Removing the last organiser would lock everyone out permanently —
        it can only be undone in the Firebase console.
      </Alert>

      <TextField
        size="small"
        fullWidth
        placeholder="Find someone by name or email"
        value={query}
        onChange={(event) => search(event.target.value)}
        sx={{ mb: 2 }}
      />

      {query.trim().length >= 2 && (
        <RowList empty={searching ? "Searching…" : "Nobody matches that."}>
          {matches
            .filter((person) => !admins.includes(person.uid))
            .map((person) => (
              <Row key={person.uid}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{person.name}</Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                      {person.email} · {person.roles.join(", ")}
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => run(
                      () => grantAdmin({ uid: person.uid, name: person.name }),
                      `${person.name} is now an organiser`
                    )}
                  >
                    Make organiser
                  </Button>
                </Stack>
              </Row>
            ))}
        </RowList>
      )}

      <Typography variant="body2" sx={{ mt: 2, mb: 1 }}>
        {admins.length} organiser{admins.length === 1 ? "" : "s"}
      </Typography>

      <RowList empty="No organisers. This should be impossible.">
        {admins.map((uid) => {
          const refusal = revokeGuard({ uid, currentUid, adminUids: admins });

          return (
            <Row key={uid}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                    {uid}
                  </Typography>
                  {uid === currentUid && <Chip size="small" label="you" />}
                </Stack>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={busy || Boolean(refusal)}
                  title={refusal ?? undefined}
                  onClick={() => run(() => revokeAdmin(uid), "Organiser access removed")}
                >
                  Remove
                </Button>
              </Stack>
            </Row>
          );
        })}
      </RowList>
    </section>
  );
}
```

- [ ] **Step 2: Render it from the page**

In `src/user/admin/Control.js`, import and add after `<EventSection …/>`:

```jsx
        <AdminsSection admins={admins} onResult={report} />
```

- [ ] **Step 3: Run the smoke test**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/pages.smoke.test.js`
Expected: PASS. `useAuth` resolves against the fake auth context `renderPage` already provides.

- [ ] **Step 4: Commit**

```bash
git add src/user/admin/control/AdminsSection.js src/user/admin/Control.js
git commit -m "Grant and revoke organiser access without risking a lockout"
```

---

### Task 13: Activity feed and undo

**Files:**
- Create: `src/user/admin/control/ActivityFeed.js`
- Create: `src/user/admin/control/describeChange.js`
- Test: `src/user/admin/control/describeChange.test.js`
- Modify: `src/user/admin/Control.js`

**Interfaces:**
- Consumes: `decodeChanges`, `undoAdminAction` (Tasks 2–3)
- Produces:
  - `describeChange(change) -> string` (pure — "config/judgingRooms: 12 → 11 items")
  - `<ActivityFeed log onResult />`

- [ ] **Step 1: Write the failing test**

Create `src/user/admin/control/describeChange.test.js`:

```js
/**
 * Rendering a before/after pair as one readable line.
 *
 * The feed is read while something is going wrong, so a change has to be
 * scannable without expanding it. Long values are summarised rather than dumped.
 */
const { describeChange } = require("./describeChange");

describe("describing one change", () => {
  test("a scalar shows both values", () => {
    expect(describeChange({ path: "teams/t1/name", before: "Alpha", after: "Omega" }))
      .toBe("name: Alpha → Omega");
  });

  test("a boolean reads as a word, not as true/false noise", () => {
    expect(describeChange({ path: "competitors/u1/checkedIn", before: true, after: false }))
      .toBe("checkedIn: yes → no");
  });

  test("a created value shows it came from nothing", () => {
    expect(describeChange({ path: "admins/u9", before: null, after: true }))
      .toBe("u9: — → yes");
  });

  test("a deleted value shows it went to nothing", () => {
    expect(describeChange({ path: "teams/t1/schedule", before: { room: "A" }, after: null }))
      .toBe("schedule: 1 field → —");
  });

  test("an array is summarised by length, not dumped", () => {
    expect(describeChange({
      path: "config/judgingRooms",
      before: ["A", "B", "C"],
      after: ["A", "B"],
    })).toBe("judgingRooms: 3 items → 2 items");
  });

  test("a long string is truncated", () => {
    const line = describeChange({ path: "a/notes", before: "x".repeat(200), after: "short" });
    expect(line.length).toBeLessThan(80);
    expect(line).toContain("…");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/control/describeChange.test.js`
Expected: FAIL — "Cannot find module './describeChange'".

- [ ] **Step 3: Write it**

Create `src/user/admin/control/describeChange.js`:

```js
/**
 * One before/after pair as a single scannable line.
 *
 * The feed gets read while something is going wrong, so a whole object dumped
 * into a row helps nobody. Scalars show both values, containers show a size.
 */

const MAX = 28;

function render(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") {
    const count = Object.keys(value).length;
    return `${count} field${count === 1 ? "" : "s"}`;
  }

  const text = String(value);
  return text.length > MAX ? `${text.slice(0, MAX)}…` : text;
}

export function describeChange({ path, before, after }) {
  const leaf = path.split("/").filter(Boolean).pop() ?? path;
  return `${leaf}: ${render(before)} → ${render(after)}`;
}

export default describeChange;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/user/admin/control/describeChange.test.js`
Expected: PASS.

- [ ] **Step 5: Write the feed**

Create `src/user/admin/control/ActivityFeed.js`:

```js
import { useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, Chip, Stack, Typography,
} from "@mui/material";
import { IoChevronDown } from "react-icons/io5";
import { RowList, Row } from "../adminUi";
import { decodeChanges, undoAdminAction } from "../adminAction";
import { describeChange } from "./describeChange";

/**
 * What has been changed, newest first.
 *
 * Realtime Database keeps no history of its own, so without this an overwrite
 * is indistinguishable from the value having always been that way. It is not
 * tamper-proof — admins hold root write and deletes skip validation — so treat
 * it as a way to answer "what did we change at 4:52", not as a ledger.
 */
export default function ActivityFeed({ log, onResult }) {
  const [busyId, setBusyId] = useState(null);

  const undo = async (entry) => {
    setBusyId(entry.id);
    try {
      onResult(await undoAdminAction(entry.id), `Undid: ${entry.summary}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <Typography variant="h2" sx={{ fontSize: "1.1rem", mb: 1 }}>Recent activity</Typography>

      <Alert severity="info" sx={{ mb: 2 }}>
        The last 100 changes made from this panel. An undo restores the recorded value
        and refuses if anything has moved since.
      </Alert>

      <RowList empty="Nothing has been changed from this panel yet.">
        {log.map((entry) => {
          const changes = entry.changes ? decodeChanges(entry.changes) : [];
          const when = entry.at
            ? new Date(entry.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : "";

          return (
            <Row key={entry.id}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "flex-start" }}>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                    <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {when}
                    </Typography>
                    <Typography sx={{ fontWeight: 600 }}>{entry.byName ?? entry.by}</Typography>
                    <Chip size="small" variant="outlined" label={entry.action} />
                    {entry.undone && <Chip size="small" label="undone" />}
                  </Stack>

                  <Typography variant="body2">{entry.summary}</Typography>

                  {changes.length > 0 && (
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{ "&:before": { display: "none" }, bgcolor: "transparent" }}
                    >
                      <AccordionSummary expandIcon={<IoChevronDown />} sx={{ px: 0, minHeight: 36 }}>
                        <Typography variant="body2">
                          {changes.length} path{changes.length === 1 ? "" : "s"}
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: 0, pt: 0 }}>
                        <Stack spacing={0.25}>
                          {changes.map((change) => (
                            <Typography
                              key={change.path}
                              variant="body2"
                              sx={{ fontFamily: "monospace", fontSize: "0.78rem" }}
                            >
                              {describeChange(change)}
                            </Typography>
                          ))}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  )}
                </Stack>

                <Button
                  size="small"
                  variant="outlined"
                  disabled={busyId === entry.id || entry.undoable === false || Boolean(entry.undone)}
                  onClick={() => undo(entry)}
                  title={entry.undoable === false ? "Too large to record in full" : undefined}
                  sx={{ minWidth: 80 }}
                >
                  {busyId === entry.id ? "Undoing…" : "Undo"}
                </Button>
              </Stack>
            </Row>
          );
        })}
      </RowList>
    </section>
  );
}
```

- [ ] **Step 6: Render it from the page**

In `src/user/admin/Control.js`, import and add as the last section:

```jsx
        <ActivityFeed log={log} onResult={report} />
```

- [ ] **Step 7: Run the smoke test and full suite**

Run: `npm run test:ci`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/user/admin/control/ActivityFeed.js src/user/admin/control/describeChange.js src/user/admin/control/describeChange.test.js src/user/admin/Control.js
git commit -m "Show what admins changed, with an undo that refuses on drift"
```

---

### Task 14: Danger zone

**Files:**
- Create: `src/user/admin/control/DangerSection.js`
- Modify: `src/user/admin/Control.js`

**Interfaces:**
- Consumes: `clearSchedule` (Task 8); `readScheduleMeta` from `src/user/judge/getJudgeSchedule.js`
- Produces: `<DangerSection onResult />`

- [ ] **Step 1: Write the section**

Create `src/user/admin/control/DangerSection.js`:

```js
import { useEffect, useState } from "react";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, Card,
  Stack, TextField, Typography,
} from "@mui/material";
import { IoChevronDown } from "react-icons/io5";
import { clearSchedule } from "../dangerZone";
import { readScheduleMeta } from "../../judge/getJudgeSchedule";

const CONFIRM_WORD = "clear";

/**
 * Collapsed by default, and the one irreversible action asks you to type a word.
 *
 * Clearing the schedule captures every team slot and every judge's assignments
 * — of the order of 100 KB — which is past the size at which the audit log
 * keeps a full before-state, so it is recorded as counts only and cannot be
 * undone. Regenerating rebuilds it; the typed confirmation is what stands in
 * for the undo.
 */
export default function DangerSection({ onResult }) {
  const [meta, setMeta] = useState(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    readScheduleMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  return (
    <section>
      <Accordion
        disableGutters
        elevation={0}
        sx={{ "&:before": { display: "none" }, bgcolor: "transparent" }}
      >
        <AccordionSummary expandIcon={<IoChevronDown />} sx={{ px: 0 }}>
          <Typography variant="h2" sx={{ fontSize: "1.1rem", color: "error.main" }}>
            Danger zone
          </Typography>
        </AccordionSummary>

        <AccordionDetails sx={{ px: 0 }}>
          <Card sx={{ p: 2, borderColor: "error.main", borderWidth: 1, borderStyle: "solid" }}>
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <Typography sx={{ fontWeight: 600 }}>Clear the judging schedule</Typography>
                <Typography variant="body2">
                  Removes every team slot and every judge assignment. Scores are left
                  alone — they are keyed by team and judge, so they survive and
                  re-attach if the same pairing comes back.
                </Typography>
              </Stack>

              {meta && (
                <Alert severity={meta.scoredTeams > 0 ? "warning" : "info"}>
                  Generated for {meta.teams} teams and {meta.judges} judges.
                  {meta.scoredTeams > 0
                    ? ` ${meta.scoredTeams} team(s) already have scores; those cards will be stranded, still counting toward averages while belonging to judges who are no longer assigned.`
                    : " No scores have been filed yet."}
                </Alert>
              )}

              <Alert severity="error">
                This cannot be undone. It is too large for the log to record in full.
              </Alert>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  placeholder={`Type "${CONFIRM_WORD}" to confirm`}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  sx={{ flex: 1 }}
                />
                <Button
                  variant="contained"
                  color="error"
                  disabled={busy || confirm.trim().toLowerCase() !== CONFIRM_WORD}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await clearSchedule();
                      onResult(result, "Schedule cleared");
                      if (result?.ok) {
                        setConfirm("");
                        setMeta(null);
                      }
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Clearing…" : "Clear schedule"}
                </Button>
              </Stack>
            </Stack>
          </Card>
        </AccordionDetails>
      </Accordion>
    </section>
  );
}
```

- [ ] **Step 2: Render it from the page**

In `src/user/admin/Control.js`, import and add after `<ActivityFeed …/>`:

```jsx
        <DangerSection onResult={report} />
```

- [ ] **Step 3: Run the smoke test and full suite**

Run: `npm run test:ci`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/user/admin/control/DangerSection.js src/user/admin/Control.js
git commit -m "Add a danger zone that spells out what clearing a schedule costs"
```

---

## Phase 4 — Edit drawers on the existing pages

### Task 15: Competitor drawer

**Files:**
- Create: `src/user/admin/edit/CompetitorEditDrawer.js`
- Modify: `src/user/admin/Search.js` (subscribe to `/teams`, add an Edit button, render the drawer)

**Interfaces:**
- Consumes: `editCompetitor`, `moveCompetitorToTeam`, `COMPETITOR_FIELDS` (Task 7); `EditDrawer` (Task 9)
- Produces: `<CompetitorEditDrawer person teams onClose onResult />`

- [ ] **Step 1: Write the drawer**

Create `src/user/admin/edit/CompetitorEditDrawer.js`:

```js
import { useState } from "react";
import { Alert, MenuItem, TextField } from "@mui/material";
import EditDrawer from "../control/EditDrawer";
import { editCompetitor, moveCompetitorToTeam } from "../recordEdits";

const DIETARY = ["none", "vegetarian", "vegan", "halal", "kosher", "gluten-free", "other"];

/**
 * Fixing a competitor record.
 *
 * Check-in is editable here on purpose: reversing one is a deliberate override
 * and worth recording, unlike the scanner, which is the normal high-volume path
 * and stays out of the log.
 *
 * The team move is a separate write because it fans out — membership is a keyed
 * set on the team AND a teamId on the person, and both must move together.
 */
export default function CompetitorEditDrawer({ person, teams, onClose, onResult }) {
  const [fields, setFields] = useState({
    firstName: person.firstName ?? "",
    lastName: person.lastName ?? "",
    email: person.email ?? "",
    dietaryRestriction: person.dietaryRestriction ?? "none",
    checkedIn: Boolean(person.checkedIn),
    foodCheckIn: Boolean(person.foodCheckIn),
  });
  const [teamId, setTeamId] = useState(person.teamId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setFields({ ...fields, [key]: event.target.value });
  const setBool = (key) => (event) => setFields({ ...fields, [key]: event.target.value === "true" });

  const fieldsDirty = Object.entries(fields).some(([key, value]) => {
    const original = key === "dietaryRestriction"
      ? person.dietaryRestriction ?? "none"
      : typeof value === "boolean" ? Boolean(person[key]) : person[key] ?? "";
    return value !== original;
  });
  const teamDirty = teamId !== (person.teamId ?? "");

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const name = `${fields.firstName} ${fields.lastName}`.trim();

      if (fieldsDirty) {
        const result = await editCompetitor(person.id, fields);
        if (!result.ok) { setError(result.error); return; }
      }

      if (teamDirty) {
        const result = await moveCompetitorToTeam({
          uid: person.id, name, toTeamId: teamId || null,
        });
        if (!result.ok) { setError(result.error); return; }
        if (result.emptiedTeam) {
          onResult({ ok: true }, `Saved. ${result.emptiedTeam} now has no members.`);
          onClose();
          return;
        }
      }

      onResult({ ok: true }, `Saved ${name || "competitor"}`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditDrawer
      open
      title={`${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || "Competitor"}
      subtitle={person.email}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      dirty={fieldsDirty || teamDirty}
    >
      <TextField label="First name" size="small" value={fields.firstName} onChange={set("firstName")} />
      <TextField label="Last name" size="small" value={fields.lastName} onChange={set("lastName")} />
      <TextField label="Email" size="small" value={fields.email} onChange={set("email")} />

      <TextField select label="Dietary" size="small" value={fields.dietaryRestriction} onChange={set("dietaryRestriction")}>
        {DIETARY.map((option) => (
          <MenuItem key={option} value={option} sx={{ textTransform: "capitalize" }}>{option}</MenuItem>
        ))}
      </TextField>

      <TextField select label="Checked in" size="small" value={String(fields.checkedIn)} onChange={setBool("checkedIn")}>
        <MenuItem value="true">Yes</MenuItem>
        <MenuItem value="false">No</MenuItem>
      </TextField>

      <TextField select label="Got food" size="small" value={String(fields.foodCheckIn)} onChange={setBool("foodCheckIn")}>
        <MenuItem value="true">Yes</MenuItem>
        <MenuItem value="false">No</MenuItem>
      </TextField>

      <TextField
        select
        label="Team"
        size="small"
        value={teamId}
        onChange={(event) => setTeamId(event.target.value)}
        helperText="Moves their membership and their record together"
      >
        <MenuItem value="">No team</MenuItem>
        {Object.entries(teams).map(([id, team]) => (
          <MenuItem key={id} value={id}>{team?.name || id}</MenuItem>
        ))}
      </TextField>

      {teamDirty && (
        <Alert severity="info">
          Moving someone does not move their team's submission or any scores.
        </Alert>
      )}
    </EditDrawer>
  );
}
```

- [ ] **Step 2: Wire it into the competitors page**

In `src/user/admin/Search.js`:

1. Add imports:

```js
import { Snackbar, Alert } from "@mui/material";
import CompetitorEditDrawer from "./edit/CompetitorEditDrawer";
```

2. Add state beside the existing hooks:

```js
  const [teams, setTeams] = useState({});
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
```

3. Add a teams subscription in a second `useEffect`:

```js
  useEffect(() => {
    const unsubscribe = onValue(ref(database, "/teams/"), (snapshot) =>
      setTeams(snapshot.val() ?? {})
    );
    return () => unsubscribe();
  }, []);
```

4. Add an Edit button in the row's action `Stack`, before the check-in button:

```jsx
                <Button size="small" variant="outlined" onClick={() => setEditing(person)}>
                  Edit
                </Button>
```

   Wrap the two buttons in `<Stack direction="row" spacing={1}>` if they are not already.

5. Add before the closing `</Layout>`:

```jsx
      {editing && (
        <CompetitorEditDrawer
          person={editing}
          teams={teams}
          onClose={() => setEditing(null)}
          onResult={(result, message) =>
            setToast(result?.ok
              ? { severity: "success", message }
              : { severity: "error", message: result?.error ?? "Something went wrong." })}
        />
      )}

      <Snackbar open={Boolean(toast)} autoHideDuration={6000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
```

- [ ] **Step 3: Run the smoke test**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/pages.smoke.test.js`
Expected: PASS — the competitor dashboard test already exists and now covers the added state.

- [ ] **Step 4: Commit**

```bash
git add src/user/admin/edit/CompetitorEditDrawer.js src/user/admin/Search.js
git commit -m "Edit a competitor and move them between teams from the dashboard"
```

---

### Task 16: Judge drawer

**Files:**
- Create: `src/user/admin/edit/JudgeEditDrawer.js`
- Modify: `src/user/admin/JudgeSearch.js`

**Interfaces:**
- Consumes: `editJudge`, `JUDGE_FIELDS` (Task 7); `EditDrawer` (Task 9)
- Produces: `<JudgeEditDrawer judge onClose onResult />`

- [ ] **Step 1: Write the drawer**

Create `src/user/admin/edit/JudgeEditDrawer.js`:

```js
import { useState } from "react";
import { Alert, MenuItem, TextField } from "@mui/material";
import EditDrawer from "../control/EditDrawer";
import { editJudge } from "../recordEdits";

/**
 * Fixing a judge record.
 *
 * isRound1Judge is here as well as on the row button, because this is where you
 * end up when you are correcting several fields at once. Both routes write the
 * same path; only this one records a before-value.
 */
export default function JudgeEditDrawer({ judge, onClose, onResult }) {
  const [fields, setFields] = useState({
    firstName: judge.firstName ?? "",
    lastName: judge.lastName ?? "",
    email: judge.email ?? "",
    company: judge.company ?? "",
    withCompany: Boolean(judge.withCompany),
    wantsToMentor: Boolean(judge.wantsToMentor),
    checkedIn: Boolean(judge.checkedIn),
    foodCheckIn: Boolean(judge.foodCheckIn),
    isRound1Judge: judge.isRound1Judge === true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setFields({ ...fields, [key]: event.target.value });
  const setBool = (key) => (event) => setFields({ ...fields, [key]: event.target.value === "true" });

  const dirty = Object.entries(fields).some(([key, value]) =>
    typeof value === "boolean"
      ? value !== (key === "isRound1Judge" ? judge.isRound1Judge === true : Boolean(judge[key]))
      : value !== (judge[key] ?? "")
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await editJudge(judge.id, fields);
      if (!result.ok) { setError(result.error); return; }
      onResult(result, `Saved ${`${fields.firstName} ${fields.lastName}`.trim() || "judge"}`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const YesNo = ({ label, name, helperText }) => (
    <TextField select size="small" label={label} value={String(fields[name])} onChange={setBool(name)} helperText={helperText}>
      <MenuItem value="true">Yes</MenuItem>
      <MenuItem value="false">No</MenuItem>
    </TextField>
  );

  return (
    <EditDrawer
      open
      title={`${judge.firstName ?? ""} ${judge.lastName ?? ""}`.trim() || "Judge"}
      subtitle={judge.email}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      dirty={dirty}
    >
      <TextField label="First name" size="small" value={fields.firstName} onChange={set("firstName")} />
      <TextField label="Last name" size="small" value={fields.lastName} onChange={set("lastName")} />
      <TextField label="Email" size="small" value={fields.email} onChange={set("email")} />
      <TextField label="Company" size="small" value={fields.company} onChange={set("company")} />

      <YesNo label="Show company" name="withCompany" />
      <YesNo label="Wants to mentor" name="wantsToMentor" />
      <YesNo label="Checked in" name="checkedIn" />
      <YesNo label="Got food" name="foodCheckIn" />
      <YesNo
        label="First round judge"
        name="isRound1Judge"
        helperText="Only judges marked here are given team assignments"
      />

      {fields.isRound1Judge !== (judge.isRound1Judge === true) && (
        <Alert severity="info">
          This takes effect the next time a schedule is generated. It does not add or
          remove assignments they already hold.
        </Alert>
      )}
    </EditDrawer>
  );
}
```

- [ ] **Step 2: Wire it into the judges page**

In `src/user/admin/JudgeSearch.js`, apply the same four edits as Task 15 step 2 — import `JudgeEditDrawer`, `Snackbar` and `Alert`; add `editing` and `toast` state; add an `Edit` button as the first item of the row's action `Stack`; render the drawer and snackbar before `</Layout>`. No teams subscription is needed here.

- [ ] **Step 3: Run the smoke test**

Run: `npx cross-env CI=true react-scripts test --watchAll=false src/pages.smoke.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/user/admin/edit/JudgeEditDrawer.js src/user/admin/JudgeSearch.js
git commit -m "Edit a judge record from the judges dashboard"
```

---

### Task 17: Extract the paper score dialog, then delete and re-enter a score

`PaperScoreDialog` is defined inside `JudgingProgress.js`, which is 554 lines — the largest admin file. Deleting a score needs the same dialog on the Teams page, so it moves to its own file first. This is a move, not a rewrite.

**Files:**
- Create: `src/user/admin/PaperScoreDialog.js` (moved out of `JudgingProgress.js:39-166`)
- Modify: `src/user/admin/JudgingProgress.js` (delete the local copy, import instead)
- Modify: `src/user/admin/TeamSearch.js` (delete + re-enter on a score row)

**Interfaces:**
- Consumes: `deleteScore` (Task 8); `writeScoreOnBehalf`, `FIRST_ROUND`, `FINAL_ROUND` from `getTeamInfo.js`; `RUBRIC` from `scoreRubric.js`
- Produces: `<PaperScoreDialog team judges round initialValues initialJudgeUid onClose onSaved />` — `initialValues` and `initialJudgeUid` are new and both optional, so the existing call site is unchanged

- [ ] **Step 1: Move the dialog**

Cut `PaperScoreDialog` (and only it) from `src/user/admin/JudgingProgress.js` into a new `src/user/admin/PaperScoreDialog.js`. Add the imports it needs at the top of the new file, add `export default PaperScoreDialog;` at the bottom, and add this header comment:

```js
/**
 * Enter a card on a judge's behalf, from paper or a dead phone.
 *
 * Lives here rather than in JudgingProgress because deleting a score on the
 * Teams page needs it too: a deleted card cannot be restored — enteredBy is
 * pinned to auth.uid by the rules, which is where "a judge cannot file under
 * another judge" lives — so the recovery path is re-typing it, which stamps
 * the correct new provenance rather than forging the old one.
 */
```

Then change the two `useState` initialisers to accept a prefill:

```js
function PaperScoreDialog({ team, judges, round, initialValues, initialJudgeUid, onClose, onSaved }) {
  const criteria = Object.keys(RUBRIC);
  const [judgeUid, setJudgeUid] = useState(initialJudgeUid ?? "");
  const [values, setValues] = useState({
    ...Object.fromEntries(criteria.map((f) => [f, ""])),
    fundable: "",
    notes: "",
    ...(initialValues ?? {}),
  });
```

In `JudgingProgress.js`, remove the now-dead imports the dialog used exclusively and add:

```js
import PaperScoreDialog from "./PaperScoreDialog";
```

- [ ] **Step 2: Verify the move changed no behaviour**

Run: `npm run test:ci`
Expected: PASS. `JudgingProgress` still renders in the smoke tests and its existing call site passes neither new prop.

- [ ] **Step 3: Commit the move on its own**

```bash
git add src/user/admin/PaperScoreDialog.js src/user/admin/JudgingProgress.js
git commit -m "Move the paper score dialog out of the judging progress page"
```

- [ ] **Step 4: Add delete and re-entry to the Teams page**

In `src/user/admin/TeamSearch.js`, change `ScoreSummary` to accept and use the new controls. Replace its signature and the per-judge block:

```js
function ScoreSummary({ label, round, teamId, teamName, scores, judgeNames = {}, onDelete }) {
```

and inside the `judgeIds.map(...)`, add after the criteria `Typography`:

```jsx
                <Button
                  size="small"
                  color="error"
                  onClick={() => onDelete({ round, teamId, teamName, judgeUid: judgeId, judgeName: judgeNames[judgeId] })}
                  sx={{ mt: 0.25 }}
                >
                  Delete this card
                </Button>
```

Update both call sites to pass the new props:

```jsx
                <ScoreSummary
                  label="First round" round={FIRST_ROUND}
                  teamId={key} teamName={team.name}
                  scores={scoresFor(key)} judgeNames={judgeNames} onDelete={setDeleting}
                />
                <ScoreSummary
                  label="Final round" round={FINAL_ROUND}
                  teamId={key} teamName={team.name}
                  scores={finalScoresFor(key)} judgeNames={judgeNames} onDelete={setDeleting}
                />
```

- [ ] **Step 5: Add the confirm-and-re-enter flow**

Add to `TeamSearch`'s imports:

```js
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar } from "@mui/material";
import { deleteScore } from "./dangerZone";
import { FIRST_ROUND, FINAL_ROUND } from "../judge/getTeamInfo";
import PaperScoreDialog from "./PaperScoreDialog";
```

Add state and the handler:

```js
  const [deleting, setDeleting] = useState(null);
  const [reentering, setReentering] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  /**
   * A deleted card cannot be written back: enteredBy is pinned to auth.uid, so
   * only its original author could restore it. Re-typing it through the paper
   * dialog is the recovery path, and it stamps the correct new provenance.
   */
  const confirmDelete = async () => {
    setBusy(true);
    try {
      const result = await deleteScore(deleting);
      if (!result.ok) {
        setToast({ severity: "error", message: result.error });
        return;
      }
      setToast({ severity: "success", message: "Card deleted. Re-enter it if it was a mistake." });
      setReentering({ ...deleting, card: result.card });
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };
```

Add before `</Layout>`:

```jsx
      {deleting && (
        <Dialog open onClose={busy ? undefined : () => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete this score?</DialogTitle>
          <DialogContent dividers>
            <Alert severity="warning">
              {deleting.judgeName ?? "This judge"}'s {deleting.round} round card for{" "}
              {deleting.teamName}. It cannot be undone — the rules pin a card to the
              person who entered it, so nobody else can write it back. You will be
              offered the values to re-type.
            </Alert>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setDeleting(null)} disabled={busy} variant="outlined">Cancel</Button>
            <Button onClick={confirmDelete} disabled={busy} variant="contained" color="error">
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {reentering && (
        <PaperScoreDialog
          team={{ teamId: reentering.teamId, teamName: reentering.teamName }}
          judges={Object.entries(judgeNames).map(([id, name]) => ({ id, name }))}
          round={reentering.round}
          initialJudgeUid={reentering.judgeUid}
          initialValues={reentering.card}
          onClose={() => setReentering(null)}
          onSaved={() => {
            setReentering(null);
            setToast({ severity: "success", message: "Card re-entered." });
          }}
        />
      )}

      <Snackbar open={Boolean(toast)} autoHideDuration={6000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
```

> Check the `judges` prop shape `PaperScoreDialog` expects when you move it in Step 1, and match it here. If it reads `judge.firstName`/`judge.lastName` rather than a single `name`, build the array accordingly.

- [ ] **Step 6: Run the tests**

Run: `npm run test:ci`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/user/admin/TeamSearch.js
git commit -m "Delete a score card and offer its values back for re-entry"
```

---

### Task 18: Team drawer

**Files:**
- Create: `src/user/admin/edit/TeamEditDrawer.js`
- Modify: `src/user/admin/TeamSearch.js`

**Interfaces:**
- Consumes: `renameTeam` (Task 7); `overrideTeamSlot`, `setTeamSubmitted`, `forceIntoFinalRound` (Task 8); `EditDrawer` (Task 9); `listRooms` (Task 4)
- Produces: `<TeamEditDrawer team teamId onClose onResult />`

- [ ] **Step 1: Write the drawer**

Create `src/user/admin/edit/TeamEditDrawer.js`:

```js
import { useEffect, useState } from "react";
import { Alert, Divider, MenuItem, TextField, Typography } from "@mui/material";
import EditDrawer from "../control/EditDrawer";
import { renameTeam } from "../recordEdits";
import { overrideTeamSlot, setTeamSubmitted, forceIntoFinalRound } from "../dangerZone";
import { listRooms } from "../roomsService";

/**
 * Everything about one team an organiser may need to change on the day.
 *
 * Each control is its own write, because each has a different fan-out: a rename
 * touches every judge's copy of the name, a slot override touches every
 * assigned judge's room and time, and the submitted flag is a single path. One
 * combined save would make the audit entries useless.
 */
export default function TeamEditDrawer({ team, teamId, onClose, onResult }) {
  const [name, setName] = useState(team.name ?? "");
  const [room, setRoom] = useState(team.schedule?.room ?? "");
  const [time, setTime] = useState(team.schedule?.time ?? "");
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { listRooms().then(setRooms).catch(() => setRooms([])); }, []);

  const nameDirty = name.trim() !== (team.name ?? "");
  const slotDirty =
    Boolean(team.schedule) &&
    (room !== (team.schedule?.room ?? "") || time !== (team.schedule?.time ?? ""));

  const run = async (work, message) => {
    setSaving(true);
    setError(null);
    try {
      const result = await work();
      if (!result.ok) { setError(result.error); return false; }
      onResult(result, message);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (nameDirty && !(await run(() => renameTeam(teamId, name), `Renamed to ${name.trim()}`))) return;
    if (slotDirty && !(await run(
      () => overrideTeamSlot({ teamId, teamName: name, room, time }),
      `Moved to ${room} at ${time}`
    ))) return;
    onClose();
  };

  return (
    <EditDrawer
      open
      title={team.name || "Unnamed team"}
      subtitle={team.submission?.ideaName}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      dirty={nameDirty || slotDirty}
    >
      <TextField
        label="Team name"
        size="small"
        value={name}
        onChange={(event) => setName(event.target.value)}
        helperText="Also updates the schedule and every judge's copy"
      />

      <Divider />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>First round slot</Typography>

      {team.schedule ? (
        <>
          <TextField select label="Room" size="small" value={room} onChange={(e) => setRoom(e.target.value)}>
            {[...new Set([...rooms, room].filter(Boolean))].map((option) => (
              <MenuItem key={option} value={option}>{option}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Time"
            size="small"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            placeholder="5:00 PM"
            helperText={`Batch ${team.schedule.batch ?? "?"} · moves every assigned judge too`}
          />
        </>
      ) : (
        <Alert severity="info">
          This team has no schedule entry. Generate a schedule before overriding a slot.
        </Alert>
      )}

      <Divider />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Submission</Typography>

      <TextField
        select
        label="Submitted"
        size="small"
        value={String(Boolean(team.submitted))}
        onChange={async (event) => {
          const submitted = event.target.value === "true";
          await run(
            () => setTeamSubmitted({ teamId, teamName: name, submitted }),
            submitted ? "Marked as submitted" : "Marked as not submitted"
          );
        }}
        helperText="Only submitted teams are given judges when a schedule is generated"
      >
        <MenuItem value="true">Yes</MenuItem>
        <MenuItem value="false">No</MenuItem>
      </TextField>

      <Divider />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Final round</Typography>

      <FinalRoundControls team={team} teamId={teamId} name={name} run={run} />
    </EditDrawer>
  );
}

/**
 * Putting one team into the final round by hand. Kept separate because it
 * writes three kinds of path — the private standings entry, the team's own slot
 * and a copy for each final-round judge — and none of them is a field edit.
 */
function FinalRoundControls({ team, teamId, name, run }) {
  const [room, setRoom] = useState(team.finalSlot?.room ?? "");
  const [timeslot, setTimeslot] = useState(team.finalSlot?.timeslot ?? "");

  return (
    <>
      {team.finalSlot && (
        <Alert severity="info">
          Already in the final round: {team.finalSlot.room} at {team.finalSlot.timeslot}.
        </Alert>
      )}
      <TextField label="Final round room" size="small" value={room} onChange={(e) => setRoom(e.target.value)} />
      <TextField label="Final round timeslot" size="small" value={timeslot} onChange={(e) => setTimeslot(e.target.value)} />
      <Alert severity="warning">
        This adds the team to the standings and gives it a slot. It does not assign
        judges — do that from the judging progress page.
      </Alert>
      <TextField
        select
        label="Add to the final round"
        size="small"
        value=""
        disabled={!room || !timeslot}
        onChange={() => run(
          () => forceIntoFinalRound({ teamId, teamName: name, room, timeslot }),
          `${name} added to the final round`
        )}
      >
        <MenuItem value="confirm">Confirm</MenuItem>
      </TextField>
    </>
  );
}
```

- [ ] **Step 2: Wire it into the teams page**

In `src/user/admin/TeamSearch.js`, import `TeamEditDrawer`, add `const [editing, setEditing] = useState(null);`, add an Edit button to each team row's header `Stack`:

```jsx
                  <Button size="small" variant="outlined" onClick={() => setEditing({ teamId: key, team })}>
                    Edit
                  </Button>
```

and render before `</Layout>`, reusing the `toast` state added in Task 17:

```jsx
      {editing && (
        <TeamEditDrawer
          team={editing.team}
          teamId={editing.teamId}
          onClose={() => setEditing(null)}
          onResult={(result, message) =>
            setToast(result?.ok
              ? { severity: "success", message }
              : { severity: "error", message: result?.error ?? "Something went wrong." })}
        />
      )}
```

- [ ] **Step 3: Run the tests**

Run: `npm run test:ci`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/user/admin/edit/TeamEditDrawer.js src/user/admin/TeamSearch.js
git commit -m "Rename a team, override its slot and force it into the final round"
```

---

## Phase 5 — Documentation and verification

### Task 19: README and the full run

**Files:**
- Modify: `README.md` (a "Control panel" section, and the rules-republish reminder)

**Interfaces:**
- Consumes: everything
- Produces: nothing new

- [ ] **Step 1: Document the panel**

Add to `README.md`, after the setup section that explains the first-admin bootstrap:

```markdown
### The control panel

`/user/admin/control` holds the settings that used to need the Firebase
console: the judging room list, the batch count and times, the final round
room, the event start date, and who counts as an organiser.

Two things there are worth knowing before you use them on the day.

**Removing a room that a schedule is using does not just edit a list.** The
room name is copied into `teams/{id}/schedule` and into every assigned judge's
`teamAssignments`, because a judge cannot read the teams node. Removing the
room offers to move those teams somewhere else and writes every copy in one
atomic update. Taking the room off the list without remapping would leave a
team walking to a room nobody has listed.

**Every change from this panel is recorded at `/adminLog`,** with the value
before and after, and most can be undone from the Recent activity feed. An undo
restores the recorded value and refuses if anything has moved since, naming the
path that changed rather than silently discarding someone else's edit.

Two things it deliberately cannot do:

- **Create or delete competitors, judges and teams.** The client SDK cannot
  delete a Firebase Auth account, so a "delete" could only remove the database
  record and would leave a working login that resolves to no role.
- **Undo a deleted score.** `enteredBy` is pinned to `auth.uid` by the rules —
  that pin is what stops a judge filing a card under another judge — so nobody
  but the original author could write a card back. Deleting one offers its
  values back for re-entry through the paper score dialog instead, which stamps
  the correct new provenance.

The log is a forensics aid, not a ledger: admins hold root write and deletes
skip validation, so entries can be erased by anyone who can write them.
```

Then, in the existing rules section, note that `rulesVersion` is now 3 and that `/adminLog` validation only takes effect once the rules are republished.

- [ ] **Step 2: Run every suite**

```bash
npm run test:ci
npm run test:rules
npm run build
```

Expected: all three pass. `npm run build` catches unused imports left behind by the `PaperScoreDialog` move, which the test run will not.

- [ ] **Step 3: Republish the rules**

This is a human step in the Firebase console and nothing in the repo can do it:

1. Realtime Database → Rules → paste `database.rules.json` → Publish.
2. Confirm the header in the console reads `// rulesVersion: 3`.

Until this is done, `/adminLog` writes still succeed through the root admin rule but are unvalidated.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document the control panel and what it deliberately will not do"
```

---

## Self-review

Run against the spec after the plan was written.

**Spec coverage** — every section maps to a task:

| Spec requirement | Task |
| --- | --- |
| `/adminLog` shape, JSON-string before/after, 50 KB cap | 1, 2 |
| `by` pinned to `auth.uid` | 1 |
| Rules diff, no `.validate` under `/config`, rulesVersion 3 | 1 |
| `applyAdminAction`, one atomic update | 2 |
| Undo with drift check | 3 |
| Rooms: in-use detection, remap fan-out | 4, 10 |
| `config/batchTimes`, `batchCount`, `finalRoundRoom`, `eventStart`; `fetchBatchConfig` | 5, 11 |
| Admin lockout guards, grant by email search | 6, 12 |
| Field edits, team-rename fan-out, move between teams | 7, 15, 18 |
| Slot override, delete score, un-submit, clear schedule, force final round | 8, 14, 17, 18 |
| Control page, sections, one subscription, nav + route | 9–14 |
| Edit drawers on the three entity pages | 15, 16, 18 |
| Score delete not undoable, re-entry via PaperScoreDialog | 8, 17 |
| Scan page stays unlogged | — by omission; no task touches `Scan.js` |
| `{ok, error}` contract, Snackbar, drift naming | 2, 3, 9 |
| Unit + rules + smoke + protectedRoute tests | 1–8, 9, 13 |

**Gap found and closed:** the spec put score deletion on the Teams page and re-entry through `PaperScoreDialog`, but that component is private to `JudgingProgress.js`. Task 17 now extracts it first, as its own commit, before anything depends on it.

**Placeholder scan:** no TBDs. Two steps intentionally say "match the existing pattern" rather than quoting code — Task 9 Step 8 (`protectedRoute.test.js`) and Task 16 Step 2 (repeat of Task 15's four edits). Both name the exact file and the exact change; neither hides a design decision.

**Type consistency checked:**
- `changes[]` is `{path, before, after}` everywhere; `encodeChanges` is the only thing that turns before/after into strings.
- `applyAdminAction` returns `{ok, entryId}` / `{ok:false, error}`; every service returns that shape, some widening it (`removeRoom` adds `inUse`, `deleteScore` adds `card`, `moveCompetitorToTeam` adds `emptiedTeam`).
- Pure builders are consistently named `*Changes` and all take snapshots, never read.
- `roomsInUse` returns `{[room]: [{teamId, teamName, time, batch}]}` in Task 4 and is destructured with those exact keys in `RemapDialog` (Task 10).
- `FIRST_ROUND` / `FINAL_ROUND` come from `getTeamInfo.js` in Tasks 8 and 17, not redefined.

**One issue found and fixed inline:** `undoAdminAction` called `requireAdmin` inside an array literal to stamp `undone.by`, which both read badly and dropped the failure on the floor. It now resolves the uid once, with its own `{ok:false}` return, before building the change-set.










