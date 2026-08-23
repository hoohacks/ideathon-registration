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
   * An assignment is stored twice on purpose -- teams/{id}/schedule and
   * judges/{uid}/teamAssignments/{id} -- so a judge can read their own list
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
