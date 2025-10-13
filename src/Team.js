import express from "express";
import { ref, push, set } from "firebase/database";
import { database } from "./firebase.js";

const server = express();
server.use(express.json()); 


server.post("/ideathon-registration//user/team", async (req, res) => {
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

server.listen(3000, () => console.log("Server running on http://localhost:3000"));