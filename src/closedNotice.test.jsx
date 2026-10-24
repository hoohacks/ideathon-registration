/**
 * What the public pages do when the doors are shut.
 *
 * The e2e suite runs against a build with the flag on, because that is what a
 * judge and a competitor are doing in every one of those journeys. That leaves
 * the closed state untested by the layer that drives the real app, so it is
 * tested here: the flag off must mean the form is *not rendered*, not merely
 * hidden behind something.
 *
 * The flag is mocked as a getter rather than re-imported per test.
 * `vi.resetModules()` would give each page its own copy of React while this
 * file keeps the original, and two Reacts means every hook throws.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ThemeProvider } from "@mui/material/styles";
import theme from "./theme";

let mockOpen = false;
vi.mock("./registrationWindow", async () => {
  const actual = await vi.importActual("./registrationWindow");
  return {
    ...actual,
    // read at render time, so a test can move it between renders
    get REGISTRATION_OPEN() {
      return mockOpen;
    },
  };
});

vi.mock("./firebase", () => ({
  database: {},
  storage: {},
  auth: { currentUser: null },
  USING_EMULATOR: false,
}));
vi.mock("firebase/database", () => ({
  ref: (_db, path) => ({ path }),
  get: vi.fn(async () => ({ exists: () => false, val: () => null })),
  set: vi.fn(),
  update: vi.fn(),
  push: vi.fn(() => ({ key: "x" })),
  onValue: (_r, cb) => {
    cb({ exists: () => false, val: () => null });
    return () => {};
  },
  serverTimestamp: () => 0,
}));
vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null }),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  onAuthStateChanged: () => () => {},
  browserLocalPersistence: {},
}));
vi.mock("firebase/storage", () => ({
  getStorage: () => ({}),
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
}));

const { AuthContext } = await import("./App");
const Registration = (await import("./Registration")).default;
const JudgeRegistration = (await import("./JudgeRegistration")).default;
const Login = (await import("./Login")).default;

const auth = {
  userCredential: null,
  userData: null,
  userTypes: [],
  loadingAuth: false,
  loadingUserData: false,
  handleLogin: vi.fn(),
  refreshUserData: vi.fn(),
  token: null,
};

function show(Page, route = "/") {
  return render(
    <ThemeProvider theme={theme}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>
          <Page />
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockOpen = false;
});
afterEach(cleanup);

describe("competitor registration", () => {
  test("closed shows the notice instead of the form", () => {
    show(Registration);

    expect(screen.getByText(/Registration is closed/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/First name/)).not.toBeInTheDocument();
  });

  test("open shows the form", () => {
    mockOpen = true;
    show(Registration);

    expect(screen.queryByText(/is closed/)).not.toBeInTheDocument();
    expect(screen.getByText("Student registration")).toBeInTheDocument();
  });
});

describe("judge and mentor sign-up", () => {
  /**
   * Judges and organizers are added up to the day, so closing registration
   * leaves this form alone.
   */
  test("closed, everybody still gets the form", () => {
    show(JudgeRegistration, "/judge-registration");

    expect(screen.getByLabelText(/First name/)).toBeInTheDocument();
    expect(screen.queryByText(/is closed/)).not.toBeInTheDocument();
  });
});

describe("signing in", () => {
  /**
   * Registration closes before the event, while everybody already registered
   * still has to get in. Signing in creates nothing, so it is never gated.
   */
  test("closed, everybody still gets the form", () => {
    show(Login);

    expect(screen.getByLabelText(/Email address/)).toBeInTheDocument();
    expect(screen.queryByText(/is closed/)).not.toBeInTheDocument();
  });

  test("open, everybody gets the form", () => {
    mockOpen = true;
    show(Login);
    expect(screen.getByLabelText(/Email address/)).toBeInTheDocument();
  });
});

test("the notice sends people who already registered to sign in", () => {
  const { container } = show(Registration);

  // the shell's own nav also has a "Sign in", so this is addressed by where it
  // goes: plain sign-in, which is never gated
  expect(container.querySelector('a[href="#/login"]')).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /About the event/ })).toBeInTheDocument();
});
