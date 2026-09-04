/**
 * The role helpers, and the profile merge behind them.
 *
 * A person can hold more than one role, and each role is a separate record.
 * The merge is what turns them into the one `userData` the app renders, so it
 * is the place a blank field on one record can erase a real one on another.
 */
import { hasRole, roleList, isAdmin, isJudge, mergeRoleProfiles, ROLES } from "./roles";

describe("role predicates", () => {
  test("a missing list is not a role", () => {
    expect(hasRole(undefined, "admin")).toBe(false);
    expect(roleList(undefined)).toEqual([]);
    expect(isAdmin(null)).toBe(false);
    expect(isJudge("judge")).toBe(false);
  });

  test("membership is membership", () => {
    expect(hasRole(["judge", "admin"], "admin")).toBe(true);
    expect(isJudge(["judge"])).toBe(true);
  });
});

describe("merging one person's role records", () => {
  const competitor = {
    firstName: "Alt", lastName: "Account", email: "alt@example.com",
    major: "CS", teamId: "t1",
  };

  test("a later record never blanks a field an earlier one filled in", () => {
    // a judge record granted from the control panel carries empty strings, not
    // absent keys -- spreading it last used to erase the name and the email,
    // which is what "all my data disappeared" looked like from the inside
    const judge = { firstName: "", lastName: "", email: "", company: "", isRound1Judge: false };

    const merged = mergeRoleProfiles([competitor, judge]);

    expect(merged.firstName).toBe("Alt");
    expect(merged.lastName).toBe("Account");
    expect(merged.email).toBe("alt@example.com");
    expect(merged.isRound1Judge).toBe(false);
    expect(merged.major).toBe("CS");
  });

  test("a real value on a later record still wins", () => {
    const judge = { firstName: "Alternate", company: "Acme" };
    const merged = mergeRoleProfiles([competitor, judge]);
    expect(merged.firstName).toBe("Alternate");
    expect(merged.company).toBe("Acme");
  });

  test("an empty field lands when nothing else supplies one", () => {
    expect(mergeRoleProfiles([{ major: "" }]).major).toBe("");
  });

  test("nothing to merge stays null, so a login with no record is still nobody", () => {
    expect(mergeRoleProfiles([null, undefined])).toBeNull();
  });

  test("a record that exists but is empty still counts as a profile", () => {
    expect(mergeRoleProfiles([{}])).toEqual({});
  });

  test("roles are merged in ROLES order", () => {
    expect(ROLES).toEqual(["competitor", "judge", "admin"]);
  });
});
