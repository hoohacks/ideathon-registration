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

describe("in development, where the server answers on the root", () => {
  // PUBLIC_URL is /idea-x here too, but localhost:3000 serves
  // the app from /. Prepending the base anyway pointed at a directory that only
  // resolves through the dev server's index.html fallback.
  const at = (pathname, extra = {}) =>
    hashTargetFor({ pathname, base: "/idea-x", ...extra });

  test("a path outside the base does not have the base invented for it", () => {
    expect(at("/judge-registration")).toBe("/#/judge-registration");
  });

  test("a deep path likewise stays where it was served from", () => {
    expect(at("/user/admin/schedule", { search: "?round=final" }))
      .toBe("/#/user/admin/schedule?round=final");
  });

  test("the root is still left alone", () => {
    expect(at("/")).toBeNull();
  });
});

describe("in production, where it is served from a subdirectory", () => {
  const base = "/idea-x";
  const at = (pathname, extra = {}) => hashTargetFor({ pathname, base, ...extra });

  test("the base path is not mistaken for part of the route", () => {
    expect(at("/idea-x/judge-registration"))
      .toBe("/idea-x/#/judge-registration");
  });

  test("the site root is left alone, with or without its trailing slash", () => {
    expect(at("/idea-x/")).toBeNull();
    expect(at("/idea-x")).toBeNull();
  });

  test("a deep path keeps the base and the route separate", () => {
    expect(at("/idea-x/user/admin/control"))
      .toBe("/idea-x/#/user/admin/control");
  });
});

describe("reading the base out of package.json's homepage", () => {
  test("a full URL contributes only its path", () => {
    expect(basePath("https://hoohacks.github.io/idea-x"))
      .toBe("/idea-x");
  });

  test("a trailing slash is dropped, so paths do not double up", () => {
    expect(basePath("https://hoohacks.github.io/idea-x/"))
      .toBe("/idea-x");
  });

  test("no homepage at all has no base", () => {
    expect(basePath("")).toBe("");
  });

  test("development gets the same base as production, because CRA derives both from homepage", () => {
    // react-scripts sets PUBLIC_URL to paths.publicUrlOrPath.slice(0, -1), and
    // in development that is the homepage's *pathname* -- not an empty string
    expect(basePath("/idea-x")).toBe("/idea-x");
  });
});
