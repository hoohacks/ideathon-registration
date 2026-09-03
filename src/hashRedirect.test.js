/**
 * The URL somebody actually writes down.
 *
 * This app is a HashRouter, so `/judge-registration` is not a route --
 * `#/judge-registration` is. The path-shaped URL has an empty hash, which
 * matches "/", which is the **competitor** form. A judge sent that link signs
 * up as a competitor and nothing on screen says so.
 */
import { hashTargetFor, basePath } from "./hashRedirect";

describe("locally, where the app is served from the root", () => {
  const at = (pathname, extra = {}) => hashTargetFor({ pathname, base: "", ...extra });

  test("a path-shaped route goes to the hash route of the same name", () => {
    expect(at("/judge-registration")).toBe("/#/judge-registration");
  });

  test("a deep path keeps its shape", () => {
    expect(at("/user/admin/schedule")).toBe("/#/user/admin/schedule");
  });

  test("the query string comes along", () => {
    expect(at("/user/admin/schedule", { search: "?round=final" }))
      .toBe("/#/user/admin/schedule?round=final");
  });

  test("the root is left alone", () => {
    expect(at("/")).toBeNull();
    expect(at("")).toBeNull();
    expect(at("/index.html")).toBeNull();
  });

  test("a URL that already has a hash route is left alone", () => {
    expect(at("/", { hash: "#/judge-registration" })).toBeNull();
    expect(at("/judge-registration", { hash: "#/login" })).toBeNull();
  });

  test("the bare # an href=\"#\" leaves behind is not a hash route", () => {
    expect(at("/judge-registration", { hash: "#" })).toBe("/#/judge-registration");
  });
});

describe("in production, where it is served from a subdirectory", () => {
  const base = "/ideathon-registration";
  const at = (pathname, extra = {}) => hashTargetFor({ pathname, base, ...extra });

  test("the base path is not mistaken for part of the route", () => {
    expect(at("/ideathon-registration/judge-registration"))
      .toBe("/ideathon-registration/#/judge-registration");
  });

  test("the site root is left alone, with or without its trailing slash", () => {
    expect(at("/ideathon-registration/")).toBeNull();
    expect(at("/ideathon-registration")).toBeNull();
  });

  test("a deep path keeps the base and the route separate", () => {
    expect(at("/ideathon-registration/user/admin/control"))
      .toBe("/ideathon-registration/#/user/admin/control");
  });
});

describe("reading the base out of package.json's homepage", () => {
  test("a full URL contributes only its path", () => {
    expect(basePath("https://hoohacks.github.io/ideathon-registration"))
      .toBe("/ideathon-registration");
  });

  test("a trailing slash is dropped, so paths do not double up", () => {
    expect(basePath("https://hoohacks.github.io/ideathon-registration/"))
      .toBe("/ideathon-registration");
  });

  test("development, where PUBLIC_URL is empty, has no base", () => {
    expect(basePath("")).toBe("");
  });
});
