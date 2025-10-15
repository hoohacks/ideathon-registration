import React, { useState } from "react";
import { getAuth } from "firebase/auth";
import { set, ref, get } from "firebase/database";
import { database } from '../firebase.js'

function NewJoinTeam() {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    await persistToDB(inputValue.trim());
    setInputValue("");
  };

  const persistToDB = async (teamId) => {
    const auth = getAuth(); // Get logged-in user info
    const userCredential = auth.currentUser;
    if (!userCredential) throw new Error("Must be signed");

    if (!userCredential || !userCredential.uid) {
      alert("You must be logged in to join a team.");
      return;
    }
  

    try {
      const teamRef = ref(database, "teams/" + teamId);
      const snapshot = await get(teamRef);
  
      if (!snapshot.exists()) {
        alert(`Team with ID "${teamId}" does not exist.`);
        return;
      }
  
      const teamData = snapshot.val();
      let members = [];
  
      // Coerce existing members into an array if possible
      if (Array.isArray(teamData.members)) {
        members = teamData.members.filter(Boolean); // remove any null/undefined
      }
  
      // Append current UID if not already in the array
      if (!members.includes(userCredential.uid)) {
        members.push(userCredential.uid);
      }
  
      // Overwrite members attribute in Firebase
      await set(ref(database, `teams/${teamId}/members`), members);
  
      console.log(`User ${userCredential.uid} added to team ${teamId}`);
      alert(`Successfully joined team ${teamId}!`);
    } catch (error) {
      console.error("Error adding user to team:", error);
      alert("Failed to join team. Check console for details.");
    }
  };
  

  return (
    <div className="join-team-page" style={styles.container}>
      <h2 style={styles.title}>Join a Team</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter Team ID"
          style={styles.input}
        />
        <button type="submit" style={styles.button}>
          Join
        </button>
      </form>
    </div>
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
  

export default NewJoinTeam;
