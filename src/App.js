import { Navigate, Routes, Route } from "react-router-dom"
import { createContext, useContext, useState, useEffect } from "react"
import Registration from "./Registration"
import Search from "./user/admin/Search.js"
import RegisteredAtDisplay from "./RegisteredAtDisplay"
import { auth } from "./firebase";
import { browserLocalPersistence, signInWithEmailAndPassword } from "firebase/auth"
import JudgeRegistration from "./JudgeRegistration"
import Login from "./Login"
import UserHome from "./user/Home"
import NewJoinTeam from "./user/NewJoinTeam"
import UserProfile from "./user/Profile"
import CheckIn from "./user/CheckIn"
import AdminScan from "./user/admin/Scan"
import JudgeDashboard from "./user/admin/JudgeSearch.js"
import ForgotPassword from "./ForgotPassword.js"
import Pairs from "./user/judge/Pairs"
import Assignments from "./user/judge/Assignments.js"
import { ref, get } from "firebase/database"
import { database } from "./firebase"
import { onAuthStateChanged } from "firebase/auth"
import Layout from "./user/Layout.js"

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function ProtectedRoute({ children, requiredRoles }) {
  const { userCredential, userTypes, loadingAuth, loadingUserData } = useAuth();

  if (loadingAuth || loadingUserData) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
          Loading...
        </div>
      </Layout>
    );
  }

  if (!userCredential) {
    return <Navigate to="/login" replace />;
  }
  console.log("User types:", userTypes);
  console.log("Required roles:", requiredRoles);

  if (requiredRoles && !requiredRoles.some(role => userTypes.includes(role))) {
    return <Navigate to="/user/home" replace />;
  }

  return children;
}

function AuthProvider({ children }) {
  const [userCredential, setUserCredential] = useState(null);
  const [token, setToken] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userTypes, setUserTypes] = useState([]);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingUserData, setLoadingUserData] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed:", user);
      setUserCredential(user ? { user } : null);
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!userCredential)
        return;

      const idToken = await userCredential.user.getIdToken();
      setToken(idToken);

      // Check if user exists in /competitors or /judges
      const userTypes = ["competitor", "judge", "admin"];
      let userFound = false;

      for (const userType of userTypes) {
        try {
          const userRef = ref(database, `/${userType}s/${userCredential.user.uid}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            setUserData(snapshot.val());
            setUserTypes(userTypes => [...userTypes, userType]);
            userFound = true;
          }
        } catch (error) {
          console.log(`Checked ${userType} data`);
        }
      }

      if (!userFound) {
        setUserData(null);
      }

      setLoadingUserData(false);
    };

    fetchUserData();
  }, [userCredential]);

  const handleLogin = async (email, password, remember = false) => {
    try {
      if (remember)
        await auth.setPersistence(browserLocalPersistence);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUserCredential(userCredential);
      return true;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ userCredential, handleLogin, token, userData, userTypes, loadingAuth, loadingUserData }}>
      {children}
    </AuthContext.Provider>
  )
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Registration />} />
        <Route path="/ideathon-registration" element={<Registration />} />
        <Route path="/RegisteredAtDisplay" element={<RegisteredAtDisplay />} />
        <Route path="/judge-registration" element={<JudgeRegistration />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<Login />} />
        <Route path="/user">
          <Route path="home" element={<ProtectedRoute><UserHome /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
          <Route path="judging" element={<ProtectedRoute requiredRoles={["judge"]}><Assignments /></ProtectedRoute>} />
          <Route path="checkin" element={<ProtectedRoute requiredRoles={["competitor", "judge"]}><CheckIn /></ProtectedRoute>} />
          <Route path="team" element={<ProtectedRoute requiredRoles={["competitor"]}><NewJoinTeam /></ProtectedRoute>} />
          <Route path="admin">
            <Route path="scan" element={<ProtectedRoute requiredRoles={["admin"]}><AdminScan /></ProtectedRoute>} />
            <Route path="search" element={<ProtectedRoute requiredRoles={["admin"]}><Search /></ProtectedRoute>} />
            <Route path="judges" element={<ProtectedRoute requiredRoles={["admin"]}><JudgeDashboard /></ProtectedRoute>} />
          </Route>
          <Route path="judge">
            <Route path="pairs" element={<ProtectedRoute requiredRoles={["judge"]}><Pairs /></ProtectedRoute>} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export { AuthContext, useAuth };

export default App
