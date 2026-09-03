/**
 * The paper fallback.
 *
 * A room is the unit rather than a batch, because a judge stays in a room while
 * teams rotate through it: one sheet, taped to one door, covers the evening.
 */
import { byRoom } from "./PrintableSchedule";

const team = (name, room, batch, judges) => ({
  name,
  submitted: true,
  schedule: { room, batch, time: `5:${batch}0 PM`, judges: judges.map((j) => ({ judgeId: j, judgeName: j })) },
});

test("teams are grouped by the room they present in", () => {
  const rooms = byRoom({
    t1: team("Alpha", "Rice 110", 1, ["Ada"]),
    t2: team("Beta", "Rice 120", 1, ["Alan"]),
    t3: team("Gamma", "Rice 110", 2, ["Ada", "Grace"]),
  });

  expect(rooms.map((r) => r.name)).toEqual(["Rice 110", "Rice 120"]);
  expect(rooms[0].slots.map((s) => s.teamName)).toEqual(["Alpha", "Gamma"]);
});

test("a room's slots are in batch order, because that is the order of the evening", () => {
  const rooms = byRoom({
    t1: team("Late", "Rice 110", 3, ["Ada"]),
    t2: team("Early", "Rice 110", 1, ["Ada"]),
    t3: team("Middle", "Rice 110", 2, ["Ada"]),
  });
  expect(rooms[0].slots.map((s) => s.teamName)).toEqual(["Early", "Middle", "Late"]);
});

test("judges are named, since the sheet is what identifies them in the room", () => {
  const rooms = byRoom({ t1: team("Alpha", "Rice 110", 1, ["Ada", "Grace"]) });
  expect(rooms[0].slots[0].judges).toEqual(["Ada", "Grace"]);
});

test("a legacy array-shaped roster prints too", () => {
  const rooms = byRoom({
    t1: { name: "Alpha", schedule: { room: "Rice 110", batch: 1, judges: { 0: { judgeName: "Ada" } } } },
  });
  expect(rooms[0].slots[0].judges).toEqual(["Ada"]);
});

test("an unscheduled team is not on any sheet", () => {
  const rooms = byRoom({
    t1: team("Alpha", "Rice 110", 1, ["Ada"]),
    t2: { name: "Nowhere", submitted: true },
  });
  expect(rooms).toHaveLength(1);
  expect(rooms[0].slots).toHaveLength(1);
});

test("no schedule at all prints nothing rather than throwing", () => {
  expect(byRoom()).toEqual([]);
  expect(byRoom({})).toEqual([]);
});
