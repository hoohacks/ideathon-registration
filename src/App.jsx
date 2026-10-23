import { Navigate, Routes, Route } from "react-router"
import { createContext, lazy, Suspense, useContext, useMemo, useState, useEffect, useCallback } from "react"
import Registration from "./Registration"
import { auth } from "./firebase";
import { browserLocalPersistence, signInWithEmailAndPassword } from "firebase/auth"
import Login from "./Login"
import { ref, get } from "firebase/database"
import { database } from "./firebase"
import { onAuthStateChanged } from "firebase/auth"
import Layout from "./user/Layout.jsx"
import { PageSkeleton } from "./loadingUi";
import JudgeRegistration from "./JudgeRegistration"
import { ROLES, hasRole, mergeRoleProfiles } from "./roles.js"

/**
 * Every page but the three front doors is its own chunk.
 *
 * Everything used to ship in one 1.7 MB bundle, so a student opening the
 * registration form on their phone downloaded the schedule planner, the results
 * charts and the QR scanner before seeing a single field. The two registration
 * forms and sign-in stay in the main bundle because they are where visits
 * start, judges' from a link in an email.
 *
 * Once someone is signed in, every other page is fetched in the background
 * (see prefetchPages). A page that waited to be opened would fail to open on
 * venue wifi that has just dropped, where a judge with one bundle could still
 * move around the app, and the scoring page already copes with being offline.
 */
const pageLoaders = [];

function page(load) {
  pageLoaders.push(load);
  return lazy(load);
}

const ForgotPassword = page(() => import("./ForgotPassword.jsx"))
const UserHome = page(() => import("./user/Home"))
const UserProfile = page(() => import("./user/Profile"))
const CheckIn = page(() => import("./user/CheckIn"))
const Assignments = page(() => import("./user/judge/Assignments.jsx"))
const Team = page(() => import("./user/team/Team.jsx"))
const NewJoinTeam = page(() => import("./user/team/NewJoinTeam.jsx"))
const CreateTeam = page(() => import("./user/team/CreateTeam.jsx"))
const RegisteredAtDisplay = page(() => import("./RegisteredAtDisplay"))
const AdminScan = page(() => import("./user/admin/Scan"))
const Search = page(() => import("./user/admin/Search.jsx"))
const JudgeDashboard = page(() => import("./user/admin/JudgeSearch.jsx"))
const Mentors = page(() => import("./user/admin/Mentors.jsx"))
const TeamDashboard = page(() => import("./user/admin/TeamSearch.jsx"))
const JudgingProgress = page(() => import("./user/admin/JudgingProgress.jsx"))
const SchedulePlanner = page(() => import("./user/admin/schedule/SchedulePlanner.jsx"))
const PrintableSchedule = page(() => import("./user/admin/schedule/PrintableSchedule.jsx"))
const Results = page(() => import("./user/admin/results/Results.jsx"))
const Control = page(() => import("./user/admin/Control.jsx"))

/**
 * Fetch every page's chunk once the browser is idle. A module that has loaded
 * once resolves from memory afterwards, so opening any page later needs no
 * network. A failure here is ignored: the page fetches again when opened.
 *
 * Returns a cancel, for the effect that schedules it.
 */
function prefetchPages() {
  const run = () => pageLoaders.forEach((load) => load().catch(() => {}));
  // Safari has no requestIdleCallback
  if (window.requestIdleCallback) {
    const id = window.requestIdleCallback(run, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 2000);
  return () => clearTimeout(id);
}

/**
 * A deploy replaces every chunk's hashed file name, so a tab opened before it
 * asks for files that are gone and the page fails to load. Reloading picks up
 * the new build. Once per minute at most, so a chunk that is genuinely
 * unreachable ends at the error screen instead of reloading forever.
 */
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    const KEY = "ideax:reloadedForChunk";
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(KEY)) || 0;
    } catch {
      // storage blocked: reload anyway, the once-a-minute guard is a nicety
    }
    // offline, a reload would swap the app for the browser's own error page
    if (!navigator.onLine || Date.now() - last < 60_000) return;
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // as above
    }
    event.preventDefault();
    window.location.reload();
  });
}

const AuthContext = createContext(null);

/**
 * Whether the phone drawer, or the desktop account menu, is open, held above
 * the route rather than inside the nav.
 *
 * `ProtectedRoute` renders `<Layout>` with a placeholder while it waits for a
 * role, and the page it then renders brings its own `Layout`. React sees a
 * different element in that position, so it throws the first one away -- nav
 * included. Anyone who tapped the menu in that window watched it open and
 * vanish, or never open at all, and the second tap worked. On a phone on
 * conference wifi that window is long enough to hit every time.
 *
 * Keeping the flag above the swap means whichever nav mounts reads the state
 * the person actually set.
 */
const NavDrawerContext = createContext(null);

function NavDrawerProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const value = useMemo(
    () => ({ open, setOpen, accountOpen, setAccountOpen }),
    [open, accountOpen]
  );
  return <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>;
}

function useAuth() {
  return useContext(AuthContext);
}

/** The frame a signed-in page shows while it waits, for a role or for its code. */
function LoadingFrame() {
  return (
    <Layout>
      <PageSkeleton label="Loading" />
    </Layout>
  );
}

function ProtectedRoute({ children, requiredRoles }) {
  const { userCredential, userTypes, loadingAuth, loadingUserData } = useAuth();

  if (loadingAuth || loadingUserData) {
    return <LoadingFrame />;
  }

  if (!userCredential) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && !requiredRoles.some(role => hasRole(userTypes, role))) {
    return <Navigate to="/user/home" replace />;
  }

  // the same frame as the role check above, so fetching the page's chunk
  // reads as one continuous load rather than a second, different one
  return <Suspense fallback={<LoadingFrame />}>{children}</Suspense>;
}

/**
 * Where an address that matches nothing goes.
 *
 * It used to be "/" for everyone, which is the student registration form -- so
 * a judge who mistyped /user/judge, signed in and mid-event, was shown a form
 * asking for their major. Signed in, the home page is the useful place to land.
 */
function UnknownAddress() {
  const { userCredential, loadingAuth } = useAuth();
  if (loadingAuth) return null;
  return <Navigate to={userCredential ? "/user/home" : "/"} replace />;
}

function AuthProvider({ children }) {
  const [userCredential, setUserCredential] = useState(null);
  const [token, setToken] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userTypes, setUserTypes] = useState([]);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingUserData, setLoadingUserData] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // keep the same object identity when the signed-in uid has not changed so
      // downstream effects do not re-run for every token refresh
      setUserCredential((prev) =>
        prev?.user?.uid === user?.uid ? prev : (user ? { user } : null)
      );
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUserData = useCallback(async () => {
    if (!userCredential) {
      // signed out: clear every trace of the previous user so roles cannot leak
      // into the next session on this tab
      setToken(null);
      setUserData(null);
      setUserTypes([]);
      setLoadingUserData(false);
      return;
    }

    setLoadingUserData(true);
    setProfileLoadError(false);

    try {
      const idToken = await userCredential.user.getIdToken();
      setToken(idToken);

      const foundRoles = [];
      const records = [];
      let readFailed = false;

      for (const role of ROLES) {
        try {
          const userRef = ref(database, `/${role}s/${userCredential.user.uid}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            foundRoles.push(role);
            records.push(snapshot.val());
          }
        } catch (error) {
          console.warn(`Could not read ${role} data:`, error);
          readFailed = true;
        }
      }

      // merged rather than spread, so the record for a role granted later does
      // not blank the name and email on the one they registered with
      // replace rather than append, otherwise roles accumulate across logins
      setProfileLoadError(readFailed);
      setUserData(mergeRoleProfiles(records));
      setUserTypes(foundRoles);
    } catch (error) {
      console.warn("Could not load profile:", error);
      setUserData(null);
      setUserTypes([]);
      setToken(null);
      setProfileLoadError(true);
    } finally {
      setLoadingUserData(false);
    }
  }, [userCredential]);

  // signed in, so the rest of the app is about to be needed
  useEffect(() => {
    if (!userCredential) return undefined;
    return prefetchPages();
  }, [userCredential]);

  useEffect(() => {
    // wait for firebase to report the initial auth state, otherwise a signed-in
    // user is briefly treated as signed out and bounced to /login
    if (loadingAuth) return;
    refreshUserData();
  }, [loadingAuth, refreshUserData]);

  const handleLogin = async (email, password, remember = false) => {
    try {
      if (remember)
        await auth.setPersistence(browserLocalPersistence);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      setUserCredential({ user: credential.user });
      return true;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ userCredential, handleLogin, refreshUserData, token, userData, userTypes, loadingAuth, loadingUserData, profileLoadError }}>
      {children}
    </AuthContext.Provider>
  )
}

function App() {
  return (
    <AuthProvider>
      <NavDrawerProvider>
      {/* only the public lazy pages reach this one; signed-in pages suspend
          inside ProtectedRoute. Blank for the moment it takes, because a
          skeleton outside the page's own shell would jump when it arrives. */}
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Registration />} />
        <Route path="/ideathon-registration" element={<Registration />} />
        <Route path="/judge-registration" element={<JudgeRegistration />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<Login />} />
        <Route path="/user">
          {/* /user and /user/admin are prefixes, not pages. Without these they
              matched, rendered nothing, and never reached the catch-all below. */}
          <Route index element={<Navigate to="/user/home" replace />} />
          <Route path="home" element={<ProtectedRoute><UserHome /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
          <Route path="judging" element={<ProtectedRoute requiredRoles={["judge", "admin", "organizer"]}><Assignments /></ProtectedRoute>} />
          <Route path="checkin" element={<ProtectedRoute requiredRoles={["competitor", "judge"]}><CheckIn /></ProtectedRoute>} />
          <Route path="team">
            <Route index element={<ProtectedRoute requiredRoles={["competitor"]}><Team /></ProtectedRoute>} />
            <Route path="join" element={<ProtectedRoute requiredRoles={["competitor"]}><NewJoinTeam /></ProtectedRoute>} />
            <Route path="create" element={<ProtectedRoute requiredRoles={["competitor"]}><CreateTeam /></ProtectedRoute>} />
          </Route>
          <Route path="admin">
            <Route index element={<Navigate to="/user/home" replace />} />
            <Route path="metrics" element={<ProtectedRoute requiredRoles={["admin"]}><RegisteredAtDisplay /></ProtectedRoute>} />
            <Route path="scan" element={<ProtectedRoute requiredRoles={["admin", "organizer"]}><AdminScan /></ProtectedRoute>} />
            <Route path="search" element={<ProtectedRoute requiredRoles={["admin"]}><Search /></ProtectedRoute>} />
            <Route path="judges" element={<ProtectedRoute requiredRoles={["admin"]}><JudgeDashboard /></ProtectedRoute>} />
            <Route path="mentors" element={<ProtectedRoute requiredRoles={["admin"]}><Mentors /></ProtectedRoute>} />
            <Route path="teams" element={<ProtectedRoute requiredRoles={["admin"]}><TeamDashboard /></ProtectedRoute>} />
            <Route path="judging" element={<ProtectedRoute requiredRoles={["admin"]}><JudgingProgress /></ProtectedRoute>} />
            <Route path="schedule" element={<ProtectedRoute requiredRoles={["admin"]}><SchedulePlanner /></ProtectedRoute>} />
            <Route path="print" element={<ProtectedRoute requiredRoles={["admin"]}><PrintableSchedule /></ProtectedRoute>} />
            <Route path="results" element={<ProtectedRoute requiredRoles={["admin"]}><Results /></ProtectedRoute>} />
            <Route path="control" element={<ProtectedRoute requiredRoles={["admin"]}><Control /></ProtectedRoute>} />
          </Route>
        </Route>

        {/* an unmatched hash route rendered nothing at all, which reads as the
            app being broken rather than the address being wrong */}
        <Route path="*" element={<UnknownAddress />} />
      </Routes>
      </Suspense>
      </NavDrawerProvider>
    </AuthProvider>
  )
}

export { AuthContext, NavDrawerContext, NavDrawerProvider, useAuth, ProtectedRoute, UnknownAddress };

export default App
