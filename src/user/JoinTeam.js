import React, { useState } from "react";
import { useAuth } from "../App";

function JoinTeam() {
  const { userCredential } = useAuth(); // Get logged-in user info
  const [teamId, setTeamId] = useState(""); // Input field state
  const [message, setMessage] = useState(""); // Display server response
  const [loading, setLoading] = useState(false);

  const handleJoinTeam = async (e) => {
    e.preventDefault();
    setMessage("");
    
    if (!userCredential) {
      setMessage("You must be logged in to join a team.");
      return;
    }

    if (!teamId.trim()) {
      setMessage("Please enter a valid Team ID.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`http://localhost:3000/user/teams/${teamId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userCredential.user.uid, // Firebase UID of logged-in user
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✅ Successfully joined team: ${data.teamId}`);
     } 
    else {
        setMessage(`❌ ${data.error || "Failed to join team"}`);
      }
    } catch (err) {
      console.error("Error joining team:", err);
      setMessage("⚠️ Something went wrong. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="join-team-page" style={styles.container}>
      <h2 style={styles.title}>Join a Team</h2>
      <form onSubmit={handleJoinTeam} style={styles.form}>
        <input
          type="text"
          placeholder="Enter Team ID"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? "Joining..." : "Join Team"}
        </button>
      </form>
      {message && <p style={styles.message}>{message}</p>}
    </div>
  );
}

// 🖌️ simple inline styles (you can replace with Tailwind or CSS later)
const styles = {
  container: {
    maxWidth: "400px",
    margin: "80px auto",
    padding: "20px",
    border: "1px solid #ddd",
    borderRadius: "12px",
    textAlign: "center",
    backgroundColor: "#fff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
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

export default JoinTeam;
