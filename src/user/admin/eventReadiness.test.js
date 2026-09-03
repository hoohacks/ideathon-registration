/**
 * The order of the day, as the interface understands it.
 *
 * Every constraint here was already enforced somewhere -- a plan refuses
 * without rooms, refuses again without enough first-round judges -- but only at
 * the moment an organizer walked into it. This is the same arithmetic, asked
 * early enough to act on.
 */
import { readEventState, SETUP, READY, SCHEDULED, JUDGING, FINAL } from "./eventReadiness";

const teams = (n, { submitted = n, scheduled = 0 } = {}) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `t${i}`,
      {
        name: `Team ${i}`,
        submitted: i < submitted,
        ...(i < scheduled ? { schedule: { room: "Rice 110", batch: 1 } } : {}),
      },
    ])
  );

const judges = (n, { roundOne = n, checkedIn = n } = {}) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `j${i}`,
      { isRound1Judge: i < roundOne, checkedIn: i < checkedIn },
    ])
  );

const ready = {
  config: { judgingRooms: ["Rice 110", "Rice 120", "Rice 130"], batchCount: 3, eventStart: "2026-10-18" },
  teams: teams(9),
  judges: judges(12),
};

describe("which part of the day this is", () => {
  test("nothing set up yet is setup", () => {
    expect(readEventState({}).phase).toBe(SETUP);
  });

  test("rooms, teams and judges in place is ready to schedule", () => {
    expect(readEventState(ready).phase).toBe(READY);
  });

  test("teams carrying a schedule means it is published", () => {
    const state = readEventState({ ...ready, teams: teams(9, { scheduled: 9 }) });
    expect(state.phase).toBe(SCHEDULED);
  });

  test("a single score means judging has started", () => {
    const state = readEventState({ ...ready, teams: teams(9, { scheduled: 9 }), scoredTeams: 1 });
    expect(state.phase).toBe(JUDGING);
  });

  test("the final round wins over everything else", () => {
    const state = readEventState({ ...ready, scoredTeams: 9, finalActive: true });
    expect(state.phase).toBe(FINAL);
  });
});

describe("what is blocking, before it blocks", () => {
  test("no rooms is named as the reason, not discovered at the planner", () => {
    const state = readEventState({ ...ready, config: { batchCount: 3 } });
    expect(state.supply.ok).toBe(false);
    expect(state.supply.error).toMatch(/judging rooms/i);
    expect(state.checks.find((c) => c.id === "rooms").done).toBe(false);
  });

  test("too few first-round judges is not a passing check", () => {
    // 20 teams over 3 batches needs a judge per team in the largest batch
    const state = readEventState({
      ...ready,
      teams: teams(20),
      judges: judges(12, { roundOne: 2 }),
    });
    expect(state.checks.find((c) => c.id === "judges").done).toBe(false);
  });

  test("a check says what the number actually is, not just that it failed", () => {
    const state = readEventState({ ...ready, judges: judges(12, { roundOne: 5 }) });
    expect(state.checks.find((c) => c.id === "judges").detail).toBe("5 of 12 judges");
  });

  test("every check knows where it gets fixed", () => {
    for (const check of readEventState({}).checks) {
      expect(check.to).toMatch(/^\/user\//);
    }
  });
});

describe("what to do next", () => {
  const labels = (state) => state.actions.map((a) => a.label);

  test("an unpublished draft outranks everything, because judges see nothing", () => {
    const state = readEventState({ ...ready, hasDraft: true });
    expect(labels(state)[0]).toMatch(/Finish the schedule draft/);
    expect(state.actions[0].primary).toBe(true);
  });

  test("a schedulable event is invited to schedule", () => {
    expect(labels(readEventState(ready))).toContain("Plan the schedule");
  });

  test("an unschedulable event is sent to fix it instead", () => {
    const state = readEventState({ ...ready, config: { batchCount: 3 } });
    expect(labels(state)).not.toContain("Plan the schedule");
    expect(labels(state)).toContain("Open the control panel");
  });

  test("once judging starts, the final round becomes reachable", () => {
    const state = readEventState({ ...ready, teams: teams(9, { scheduled: 9 }), scoredTeams: 4 });
    expect(labels(state)).toContain("Plan the final round");
  });

  test("the final round is not offered before there is anything to rank", () => {
    const state = readEventState({ ...ready, teams: teams(9, { scheduled: 9 }) });
    expect(labels(state)).not.toContain("Plan the final round");
  });

  test("never more than three, or it is the dropdown again", () => {
    const state = readEventState({ ...ready, teams: teams(9, { scheduled: 9 }), scoredTeams: 4, hasDraft: true });
    expect(state.actions.length).toBeLessThanOrEqual(3);
  });
});
