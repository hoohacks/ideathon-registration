import express from "express";
import { ref, push, set, get } from "firebase/database";
import { database } from "./firebase.js";


const server = express();
server.use(express.json()); 


server.post("/user/team", async (req, res) => {
  try {
    const teamsRef = ref(database, "teams");
    const newTeamRef = push(teamsRef);

    const teamData = {
      name: req.body.name,
      createdBy: req.body.userId,
      members: [req.body.userId],
    };

    await set(newTeamRef, teamData);

    res.status(201).send({ teamId: newTeamRef.key, ...teamData });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to create team" });
  }
});


server.post("/user/teams/:team_id", async (req, res) => {
  try {
    const teamId = req.params.team_id;
    const userId = req.body.userId;

    if (!userId) {
      return res.status(400).send({ error: "Missing userId" });
    }

    const teamRef = ref(database, `teams/${teamId}`);
    const teamSnapshot = await get(teamRef);

    if (!teamSnapshot.exists()) {
      return res.status(404).send({ error: "Team not found" });
    }

    const teamData = teamSnapshot.val();

    // Check if already a member
    if (teamData.members && teamData.members.includes(userId)) {
      return res.status(400).send({ error: "User already in team" });
    }

    // Add the user to members list
    const updatedMembers = teamData.members ? [...teamData.members, userId] : [userId];
    await set(teamRef, { ...teamData, members: updatedMembers });

    res.status(200).send({ message: "Joined team successfully", teamId, members: updatedMembers });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to join team" });
  }
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));