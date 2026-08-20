/**
 * The route guard.
 *
 * This is the component every authenticated page in the app is wrapped in, and
 * it had no tests. Note what it is and is not: it decides what *renders*, not
 * what a person can *read*. Anyone can set `userTypes` in DevTools and paint an
 * admin page; the database rules are what keep it empty. These tests cover the
 * navigation behaviour, including the loading gate that exists to fix a real
 * bug — without it a signed-in user was briefly treated as signed out and
 * bounced to /login on every refresh.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("./firebase", () => ({ database: {}, storage: {}, auth: {} }));
jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: jest.fn(async () => ({ exists: () => false, val: () => null })),
  onValue: () => () => {},
}));
jest.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null }),
  onAuthStateChanged: () => () => {},
  signInWithEmailAndPassword: jest.fn(),
  browserLocalPersistence: {},
}));

const { AuthContext, ProtectedRoute } = require("./App");

const SIGNED_IN = { user: { uid: "u1" } };

function renderGuard({ auth, requiredRoles, start = "/secret" }) {
  const value = {
    userCredential: null,
    userTypes: [],
    loadingAuth: false,
    loadingUserData: false,
    ...auth,
  };

  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[start]}>
        <Routes>
          <Route
            path="/secret"
            element={
              <ProtectedRoute requiredRoles={requiredRoles}>
                <div>secret content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/user/home" element={<div>home page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("while the session is still resolving", () => {
  // The gate below is not cosmetic. Without it `userCredential` is null on the
  // first render of every page load, the guard concludes "signed out", and a
  // signed-in user is redirected to /login before Firebase has answered.
  test.each([
    ["auth", { loadingAuth: true }],
    ["the role lookup", { loadingUserData: true }],
  ])("waits for %s rather than redirecting", (_label, flags) => {
    renderGuard({ auth: { userCredential: null, ...flags } });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  test("a signed-in user is not bounced to login mid-load", () => {
    renderGuard({ auth: { userCredential: SIGNED_IN, loadingUserData: true } });
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });
});

describe("signed out", () => {
  test("goes to the login page", () => {
    renderGuard({ auth: { userCredential: null } });
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  test("goes to login even when no role is required", () => {
    renderGuard({ auth: { userCredential: null }, requiredRoles: undefined });
    expect(screen.getByText("login page")).toBeInTheDocument();
  });
});

describe("signed in", () => {
  test("an unguarded route renders for anyone, including a roleless account", () => {
    renderGuard({ auth: { userCredential: SIGNED_IN, userTypes: [] } });
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  test("the right role renders", () => {
    renderGuard({
      auth: { userCredential: SIGNED_IN, userTypes: ["admin"] },
      requiredRoles: ["admin"],
    });
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  test("any one of several accepted roles is enough", () => {
    renderGuard({
      auth: { userCredential: SIGNED_IN, userTypes: ["judge"] },
      requiredRoles: ["judge", "admin"],
    });
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  test("the wrong role goes home, not to login", () => {
    renderGuard({
      auth: { userCredential: SIGNED_IN, userTypes: ["competitor"] },
      requiredRoles: ["admin"],
    });
    expect(screen.getByText("home page")).toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  test("a competitor cannot reach an admin page", () => {
    renderGuard({
      auth: { userCredential: SIGNED_IN, userTypes: ["competitor"] },
      requiredRoles: ["admin"],
    });
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  test("a judge cannot reach an admin page", () => {
    renderGuard({
      auth: { userCredential: SIGNED_IN, userTypes: ["judge"] },
      requiredRoles: ["admin"],
    });
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  test("a roleless account cannot reach a guarded page", () => {
    renderGuard({
      auth: { userCredential: SIGNED_IN, userTypes: [] },
      requiredRoles: ["admin"],
    });
    expect(screen.getByText("home page")).toBeInTheDocument();
  });

  test("an account holding several roles gets the union of them", () => {
    renderGuard({
      auth: { userCredential: SIGNED_IN, userTypes: ["competitor", "judge"] },
      requiredRoles: ["judge"],
    });
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  test("userTypes that is not an array does not throw", () => {
    // it is [] before the provider resolves, but the guard should not explode
    // if it is ever handed something else
    renderGuard({
      auth: { userCredential: SIGNED_IN, userTypes: undefined },
      requiredRoles: ["admin"],
    });
    expect(screen.getByText("home page")).toBeInTheDocument();
  });
});
