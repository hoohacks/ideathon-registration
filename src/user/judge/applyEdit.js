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
  // `op.teamName` -- carried on a drift repair for a team that appeared after
  // the plan was built -- takes priority over `next.teamNames`, which by
  // definition cannot know about that team yet. Ordinary hand-edit ops never
  // set `op.teamName`, so this changes nothing for them.
  const teamName = op.teamName ?? next.teamNames[op.teamId] ?? current?.teamName ?? "that team";

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
      if (!Number.isInteger(op.batch) || op.batch < 1 || op.batch > next.basis.batchCount) {
        return fail(`There is no batch ${op.batch}. This plan has ${next.basis.batchCount}.`);
      }
      // a team the plan was not built from has not submitted; a late one is
      // placed through applyRepair, which adds it to the basis first
      if (!current && !(next.basis.teamIds ?? []).includes(op.teamId)) {
        return fail(`${teamName === "that team" ? "That team" : teamName} has not submitted a project, so it cannot be placed.`);
      }
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

/**
 * Apply one of `checkDrift`'s repairs, and bring `basis` along with it.
 *
 * A repair is not an ordinary edit: it answers a difference between `basis`
 * and the live world, so `basis` has to move too or the next drift check
 * reports the same difference again. A placed team that stays out of
 * `basis.teamIds` reads as "submitted after this plan was built" on every
 * publish, forever; a move into a room added since the build is refused as
 * "not a configured room". Both used to dead-end the publish.
 *
 * `dropTeam` is not recorded as an edit: undoing it would put back a team that
 * has withdrawn.
 */
export function applyRepair(plan, repair) {
  if (repair.type === "dropTeam") {
    const assignments = { ...plan.assignments };
    delete assignments[repair.teamId];
    return {
      ok: true,
      plan: {
        ...plan,
        assignments,
        basis: {
          ...plan.basis,
          teamIds: (plan.basis?.teamIds ?? []).filter((id) => id !== repair.teamId),
        },
      },
    };
  }

  if (repair.type !== "moveTeam") return applyEdit(plan, repair);

  const teamIds = plan.basis?.teamIds ?? [];
  const base = {
    ...plan,
    basis: {
      ...plan.basis,
      rooms: repair.rooms ?? plan.basis?.rooms ?? [],
      teamIds: teamIds.includes(repair.teamId) ? teamIds : [...teamIds, repair.teamId].sort(),
    },
    teamNames: repair.teamName
      ? { ...plan.teamNames, [repair.teamId]: repair.teamName }
      : plan.teamNames,
  };
  return applyEdit(base, repair);
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
