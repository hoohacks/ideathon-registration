import { useState, useContext, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { ref, set, get } from "firebase/database";
import { database } from "../../firebase.js";
import Layout from "../Layout.js";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { AuthContext } from "../../App";

function CreateTeam() {
  const navigate = useNavigate();
  const { refreshUserData, userData } = useContext(AuthContext);
  const [inputValue, setInputValue] = useState("");

  // If user data already has a teamId, redirect to team page
  useEffect(() => {
    if (userData && userData.teamId)
      navigate('/user/team');
  }, [userData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    await createTeam(inputValue.trim());
    setInputValue("");
  };

  const createTeam = async (teamId) => {
    const auth = getAuth();
    const userCredential = auth.currentUser;

    if (!userCredential || !userCredential.uid) {
      alert("You must be logged in to create a team.");
      return;
    }

    try {
      const teamRef = ref(database, "teams/" + teamId);
      const snapshot = await get(teamRef);

      // Prevent overwriting an existing team
      if (snapshot.exists()) {
        alert(`A team with ID "${teamId}" already exists.`);
        return;
      }

      // Create a new team object
      const teamData = {
        name: teamId,
        createdBy: userCredential.uid,
        members: [userCredential.uid]
      };

      // Write the new team to Firebase
      await set(teamRef, teamData);

      console.log(`Team "${teamId}" created by ${userCredential.uid}`);
      alert(`Team "${teamId}" created successfully!`);

      await refreshUserData();

      return navigate('/user/team');
    } catch (error) {
      console.error("Error creating team:", error);
      alert("Failed to create team. Check console for details.");
    }
  };

  return (
    <Layout>
      <div className="create-team-page" style={styles.container}>
        <h2 style={styles.title}>Create a Team</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter New Team ID"
            style={styles.input}
          />
          <button type="submit" style={styles.button}>
            Create
          </button>

          <p>
            or <Link to="/user/team/join">Join an Existing Team</Link>
          </p>
        </form>
      </div>
    </Layout>
  );
}

const styles = {
  container: {
    maxWidth: "400px",
    margin: "80px auto",
    padding: "20px",
    border: "1px solid #ddd",
    borderRadius: "12px",
    textAlign: "center",
    backgroundColor: "#fff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
  },
  title: { marginBottom: "20px" },
  form: { display: "flex", flexDirection: "column", gap: "10px" },
  input: {
    padding: "10px",
    border: "1px solid #ccc",
    borderRadius: "6px",
    fontSize: "16px",
  },
  button: {
    padding: "10px",
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  message: { marginTop: "15px", fontSize: "15px" },
};

export default CreateTeam;
