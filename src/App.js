import { Navigate, Routes, Route } from "react-router-dom"
import { createContext, useContext, useState, useEffect } from "react"
import Registration from "./Registration"
import Search from "./Search"
import RegisteredAtDisplay from "./RegisteredAtDisplay"
import { auth } from "./firebase";
import { browserLocalPersistence, signInWithEmailAndPassword } from "firebase/auth"
import JudgeRegistration from "./JudgeRegistration"
import Login from "./Login"
import UserHome from "./user/Home"
import UserProfile from "./user/Profile"
import CheckIn from "./user/CheckIn"
import AdminScan from "./user/admin/Scan"
import ForgotPassword from "./ForgotPassword.js"
import Pairs from "./user/judge/Pairs"
import { ref, get } from "firebase/database"
import { database } from "./firebase"

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function ProtectedRoute({ children, requiredRole }) {
  const { userCredential, userType } = useAuth();

  if (!userCredential) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && userType !== requiredRole) {
    return <Navigate to="/user/home" replace />;
  }

  return children;
}

function AuthProvider({ children }) {
  const [userCredential, setUserCredential] = useState(null);
  const [token, setToken] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userType, setUserType] = useState(null);

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
        const userRef = ref(database, `/${userType}s/${userCredential.user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          setUserData(snapshot.val());
          setUserType(userType);
          userFound = true;
          break;
        }
      }

      if (!userFound) {
        setUserData(null);
      }
    };

    fetchUserData();
  }, [userCredential]);

  const handleLogin = async (email, password, remember = false) => {
    try {
      if (remember) {
        await auth.setPersistence(browserLocalPersistence);
      }
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUserCredential(userCredential);
      return true;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ userCredential, handleLogin, token, userData, userType }}>
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
        <Route path="/search" element={<ProtectedRoute requiredRole="admin"><Search /></ProtectedRoute>} />
        <Route path="/RegisteredAtDisplay" element={<RegisteredAtDisplay />} />
        <Route path="/judge-registration" element={<JudgeRegistration />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<Login />} />
        <Route path="/user">
          <Route path="home" element={<ProtectedRoute><UserHome /></ProtectedRoute>} />
          <Route path="profile" element={<ProtectedRoute requiredRole="competitor"><UserProfile /></ProtectedRoute>} />
          <Route path="checkin" element={<ProtectedRoute requiredRole="competitor"><CheckIn /></ProtectedRoute>} />
          <Route path="admin">
            <Route path="scan" element={<ProtectedRoute requiredRole="admin"><AdminScan /></ProtectedRoute>} />
          </Route>
          <Route path="judge">
            <Route path="pairs" element={<ProtectedRoute requiredRole="judge"><Pairs /></ProtectedRoute>} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export { AuthContext, useAuth };

export default App
