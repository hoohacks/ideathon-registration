import { Navigate, Routes, Route } from "react-router-dom"
import { createContext, useContext, useState, useEffect } from "react"
import Registration from "./Registration"
import Search from "./Search"
import RegisteredAtDisplay from "./RegisteredAtDisplay"
import { auth } from "./firebase";
import { signInWithEmailAndPassword } from "firebase/auth"

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function ProtectedRoute({ children }) {
  const { token, handleLogin } = useAuth();
  const [authenticated, setAuthenticated] = useState(null);

  useEffect(() => {
    async function checkAuth() {
      if (!token && !(await handleLogin()))
        setAuthenticated(false);
      else if (token)
        setAuthenticated(true);
    }

    checkAuth();
  }, [token, handleLogin]);

  if (authenticated === null)
    return null;

  return authenticated ? children : <Navigate to="/" />;
}

function AuthProvider({ children }) {
  const [token, setToken] = useState(null);

  const promptAuth = async () => {
    const email = prompt("Email?");
    const password = prompt("Password?");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user.getIdToken();
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const handleLogin = async () => {
    const token = await promptAuth();
    setToken(token);
    return token !== null;
  };

  return (
    <AuthContext.Provider value={{ token, handleLogin }}>
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
        <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/RegisteredAtDisplay" element={<RegisteredAtDisplay />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
