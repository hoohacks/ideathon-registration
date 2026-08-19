import { useState, useContext, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { ref, set, push } from "firebase/database";
import { database } from "../../firebase.js";
import Layout from "../Layout.js";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { AuthContext } from "../../App";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

function CreateTeam() {
  const navigate = useNavigate();
  const { refreshUserData, userData } = useContext(AuthContext);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // If user data already has a teamId, redirect to team page
  useEffect(() => {
    if (userData && userData.teamId) navigate("/user/team");
  }, [userData, navigate]);

  const createTeam = async (teamName) => {
    const auth = getAuth();
    const userCredential = auth.currentUser;

    if (!userCredential || !userCredential.uid) {
      setError("You must be signed in to create a team.");
      return;
    }

    try {
      const teamRef = push(ref(database, "teams/"));

      // members is a keyed set, not an array, so the database rules can
      // check members.hasChild(auth.uid)
      await set(teamRef, {
        name: teamName,
        createdBy: userCredential.uid,
        members: { [userCredential.uid]: true },
      });

      await set(ref(database, `competitors/${userCredential.uid}/teamId`), teamRef.key);
      await refreshUserData();

      return navigate("/user/team");
    } catch (err) {
      console.error("Error creating team:", err);
      setError("Could not create the team. Please try again.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || !inputValue.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createTeam(inputValue.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout maxWidth="xs">
      <Typography variant="h1" gutterBottom>
        Create a team
      </Typography>

      <Card>
        <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Team name"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                helperText="Your teammates join with the ID you get next."
                autoFocus
                fullWidth
              />
              {error && <Alert severity="error">{error}</Alert>}
              <Button type="submit" variant="contained" disabled={busy || !inputValue.trim()}>
                {busy ? "Creating…" : "Create team"}
              </Button>
              <Link
                component={RouterLink}
                to="/user/team/join"
                variant="body2"
                sx={{ textAlign: "center" }}
              >
                Join an existing team instead
              </Link>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Layout>
  );
}

export default CreateTeam;
