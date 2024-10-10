import { Navigate, Routes, Route } from "react-router-dom"
import React from "react"
import Registration from "./Registration"
import Search from "./Search"
import RegisteredAtDisplay from "./RegisteredAtDisplay"
import { importSPKI, jwtVerify } from "jose"
import jwtPublicKeyFile from "./jwt.pub.json"

const AuthContext = React.createContext(null);

function useAuth() {
  return React.useContext(AuthContext);
}

function ProtectedRoute({ children }) {
  const { token, handleLogin } = useAuth();
  const [authenticated, setAuthenticated] = React.useState(null);


  React.useEffect(() => {
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
  const [token, setToken] = React.useState(null);

  const promptAuth = async () => {
    const token = prompt("Access token?");

    try {
      const jwtPublicKey = await importSPKI(jwtPublicKeyFile.publicKey, "RS256");
      return await jwtVerify(token, jwtPublicKey);
    } catch (e) {
      console.error(e);
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
