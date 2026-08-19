/**
 * Render smoke tests.
 *
 * Most of this app sits behind authentication, so the signed-in pages cannot be
 * opened in a browser without a real account. These render each one against a
 * stubbed Firebase and a fake auth context, which catches the crashes a build
 * cannot: bad prop shapes, undefined reads during render, invalid element
 * nesting. It asserts the page paints something recognisable, not how it looks.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import theme from "./theme";
import { AuthContext } from "./App";

// ---- Firebase stubs -------------------------------------------------------

jest.mock("./firebase", () => ({
  database: {},
  storage: {},
  auth: { currentUser: { uid: "judge-1", email: "judge@example.com" } },
}));

jest.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: jest.fn(async () => ({ exists: () => false, val: () => null })),
  set: jest.fn(async () => {}),
  update: jest.fn(async () => {}),
  push: jest.fn(() => ({ key: "new-team" })),
  onValue: (_ref, cb) => {
    cb({ exists: () => false, val: () => null });
    return () => {};
  },
  query: (r) => r,
  orderByChild: jest.fn(),
  equalTo: jest.fn(),
  serverTimestamp: () => 0,
}));

jest.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { uid: "judge-1", email: "judge@example.com" } }),
  sendPasswordResetEmail: jest.fn(async () => {}),
  signInWithEmailAndPassword: jest.fn(async () => ({ user: { uid: "u1" } })),
  createUserWithEmailAndPassword: jest.fn(async () => ({ user: { uid: "u1" } })),
  onAuthStateChanged: () => () => {},
  browserLocalPersistence: {},
}));

jest.mock("firebase/storage", () => ({
  getStorage: () => ({}),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
  getDownloadURL: jest.fn(async () => "https://example.com/deck.pdf"),
}));

// react-zxing wants a camera
jest.mock("react-zxing", () => ({ useZxing: () => ({ ref: { current: null } }) }));

// chart.js draws to a canvas, which jsdom does not implement
jest.mock("react-chartjs-2", () => ({ Line: () => null, Bar: () => null }));

// ---- Helpers --------------------------------------------------------------

const baseAuth = {
  userCredential: { user: { uid: "u1", email: "person@example.com" } },
  userData: { firstName: "Alex", lastName: "Kim", email: "person@example.com" },
  userTypes: [],
  loadingAuth: false,
  loadingUserData: false,
  refreshUserData: jest.fn(),
  handleLogin: jest.fn(),
  token: null,
};

function renderPage(Component, authOverrides = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <AuthContext.Provider value={{ ...baseAuth, ...authOverrides }}>
        <MemoryRouter>
          <Component />
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

// ---- Pages ----------------------------------------------------------------

const Home = require("./user/Home").default;
const Profile = require("./user/Profile").default;
const CheckIn = require("./user/CheckIn").default;
const Team = require("./user/team/Team").default;
const CreateTeam = require("./user/team/CreateTeam").default;
const JoinTeam = require("./user/team/NewJoinTeam").default;
const Assignments = require("./user/judge/Assignments").default;
const Search = require("./user/admin/Search").default;
const JudgeSearch = require("./user/admin/JudgeSearch").default;
const TeamSearch = require("./user/admin/TeamSearch").default;
const Metrics = require("./RegisteredAtDisplay").default;
const Scan = require("./user/admin/Scan").default;
const Login = require("./Login").default;
const ForgotPassword = require("./ForgotPassword").default;

describe("pages render without crashing", () => {
  test("home", async () => {
    renderPage(Home, { userTypes: ["competitor"] });
    expect(await screen.findByText(/Welcome/)).toBeInTheDocument();
  });

  test("profile", async () => {
    renderPage(Profile, { userTypes: ["competitor"] });
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText("Alex Kim")).toBeInTheDocument();
  });

  test("profile with no record shows a fallback rather than crashing", async () => {
    renderPage(Profile, { userData: null, userTypes: [] });
    expect(await screen.findByText(/No profile found/)).toBeInTheDocument();
  });

  test("check in", async () => {
    renderPage(CheckIn, { userTypes: ["competitor"] });
    expect(await screen.findByRole("heading", { name: "Check in" })).toBeInTheDocument();
  });

  test("team page with no team", async () => {
    renderPage(Team, { userTypes: ["competitor"] });
    expect(await screen.findByText(/not on a team yet/)).toBeInTheDocument();
  });

  test("create team", async () => {
    renderPage(CreateTeam, { userTypes: ["competitor"] });
    expect(await screen.findByRole("heading", { name: "Create a team" })).toBeInTheDocument();
  });

  test("join team", async () => {
    renderPage(JoinTeam, { userTypes: ["competitor"] });
    expect(await screen.findByRole("heading", { name: "Join a team" })).toBeInTheDocument();
  });

  test("judging as a judge", async () => {
    renderPage(Assignments, { userTypes: ["judge"] });
    expect(await screen.findByRole("heading", { name: "Judging" })).toBeInTheDocument();
    expect(await screen.findByText("First round")).toBeInTheDocument();
  });

  test("judging as an admin shows the schedule controls", async () => {
    renderPage(Assignments, { userTypes: ["admin"] });
    expect(await screen.findByText("Generate schedule")).toBeInTheDocument();
  });

  test("competitor dashboard", async () => {
    renderPage(Search, { userTypes: ["admin"] });
    expect(await screen.findByRole("heading", { name: "Competitors" })).toBeInTheDocument();
  });

  test("judge dashboard", async () => {
    renderPage(JudgeSearch, { userTypes: ["admin"] });
    expect(await screen.findByRole("heading", { name: "Judges" })).toBeInTheDocument();
  });

  test("team dashboard", async () => {
    renderPage(TeamSearch, { userTypes: ["admin"] });
    expect(await screen.findByRole("heading", { name: "Teams" })).toBeInTheDocument();
  });

  test("metrics", async () => {
    renderPage(Metrics, { userTypes: ["admin"] });
    expect(await screen.findByRole("heading", { name: "Registration Metrics" })).toBeInTheDocument();
  });

  test("check-in scanner", async () => {
    renderPage(Scan, { userTypes: ["admin"] });
    expect(await screen.findByRole("heading", { name: "Scan check-in" })).toBeInTheDocument();
    // the two things it can record, and the camera it records them with
    expect(screen.getByRole("button", { name: "Event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
  });

  test("metrics with no registrations invites rather than showing empty axes", async () => {
    renderPage(Metrics, { userTypes: ["admin"] });
    expect(await screen.findByText(/No registrations yet/)).toBeInTheDocument();
  });

  test("login", async () => {
    renderPage(Login);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  test("forgot password", async () => {
    renderPage(ForgotPassword);
    expect(await screen.findByRole("heading", { name: "Reset password" })).toBeInTheDocument();
  });
});
