import { ref, get, update, push } from "firebase/database";
import { getAuth } from "firebase/auth";
import { database } from "../../firebase.js";

/**
 * Creating, joining and leaving a team.
 *
 * Membership is stored in two places that must agree:
 *
 *   teams/{teamId}/members/{uid} = true      what the rules read
 *   competitors/{uid}/teamId     = teamId    what the app routes on
 *
 * These used to be written as two sequential `set()` calls. If the second one
 * failed -- a dropped connection on venue wifi is the normal case, not the
 * exotic one -- the person ended up a member of a team the app would not route
 * them to, and the create screen would happily let them make a second one. The
 * admin-side equivalent, moveCompetitorToTeam, already got this right with a
 * single multi-path update; this is the same fix for the three flows a
 * competitor actually uses.
 *
 * Realtime Database applies a multi-path update atomically and checks each path
 * against its own rule, both of which a competitor already holds.
 */

/**
 * The largest a team may get.
 *
 * This is advisory, and it is worth being precise about why: Realtime Database
 * rules cannot count children. numChildren() is a client SDK method, and a rule
 * that calls it does not merely fail -- it stops the whole rules file loading.
 * So there is no server-side cap, and someone working from the console can
 * exceed it. It stops the ordinary path, which is what it is for.
 *
 * The closed-after-submission limit below IS enforced in the rules, because
 * that one is expressible.
 */
export const MAX_TEAM_SIZE = 6;

function requireUid() {
  const user = getAuth().currentUser;
  if (!user?.uid) throw new Error("You must be signed in.");
  return user.uid;
}

/**
 * Create a team with this person as creator and only member.
 *
 * Returns { ok, teamId } or { ok: false, error }.
 */
export async function createTeam(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return { ok: false, error: "Give the team a name." };

  let uid;
  try {
    uid = requireUid();
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    const existing = await get(ref(database, `competitors/${uid}/teamId`));
    if (existing.exists() && existing.val()) {
      return { ok: false, error: "You are already on a team. Leave it before creating another." };
    }

    const teamId = push(ref(database, "teams")).key;

    await update(ref(database), {
      [`teams/${teamId}`]: {
        name: trimmed,
        createdBy: uid,
        // a keyed set, not an array, so the rules can check members.hasChild()
        members: { [uid]: true },
      },
      [`competitors/${uid}/teamId`]: teamId,
    });

    return { ok: true, teamId };
  } catch (error) {
    console.error("Error creating team:", error);
    return { ok: false, error: "Could not create the team. Please try again." };
  }
}

/**
 * Join an existing team by id.
 *
 * Every reason this can fail is checked here so the person gets a sentence
 * rather than a permission error. The closed-after-submission rule is enforced
 * in database.rules.json as well, so it holds even from the console; the size
 * cap cannot be, for the reason given on MAX_TEAM_SIZE.
 */
export async function joinTeam(teamId) {
  const trimmed = String(teamId ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter a team ID." };

  let uid;
  try {
    uid = requireUid();
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    const existing = await get(ref(database, `competitors/${uid}/teamId`));
    if (existing.exists() && existing.val()) {
      return { ok: false, error: "You are already on a team. Leave it before joining another." };
    }

    // Only the name and these two facts are readable to someone who is not a
    // member yet, so they are read individually rather than as a team node.
    const [nameSnap, submittedSnap, membersSnap] = await Promise.all([
      get(ref(database, `teams/${trimmed}/name`)),
      get(ref(database, `teams/${trimmed}/submitted`)),
      get(ref(database, `teams/${trimmed}/members`)),
    ]);

    if (!nameSnap.exists()) {
      return { ok: false, error: `No team found with the ID "${trimmed}".` };
    }
    if (submittedSnap.val() === true) {
      return {
        ok: false,
        error: `${nameSnap.val()} has already submitted its project, so it is closed to new members. Ask an organizer if you need to be added.`,
      };
    }

    const size = Object.keys(membersSnap.val() ?? {}).length;
    if (size >= MAX_TEAM_SIZE) {
      return {
        ok: false,
        error: `${nameSnap.val()} already has ${MAX_TEAM_SIZE} members, which is the maximum. An organizer can add you from the Competitors dashboard if the team is meant to be larger.`,
      };
    }

    await update(ref(database), {
      // just this member, so joining cannot drop or reorder anyone else
      [`teams/${trimmed}/members/${uid}`]: true,
      [`competitors/${uid}/teamId`]: trimmed,
    });

    return { ok: true, teamId: trimmed, teamName: nameSnap.val() };
  } catch (error) {
    console.error("Error joining team:", error);
    return { ok: false, error: "Could not join that team. Please try again." };
  }
}

/** Leave a team, clearing both halves of the membership together. */
export async function leaveTeam(teamId) {
  let uid;
  try {
    uid = requireUid();
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    await update(ref(database), {
      [`teams/${teamId}/members/${uid}`]: null,
      [`competitors/${uid}/teamId`]: null,
    });
    return { ok: true };
  } catch (error) {
    console.error("Error leaving team:", error);
    return { ok: false, error: "Could not leave the team. Please try again." };
  }
}
