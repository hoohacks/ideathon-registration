import { useState, useEffect, useContext } from "react";
import { getAuth } from "firebase/auth";
import { set, ref, get } from "firebase/database";
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

function NewJoinTeam() {
  const navigate = useNavigate();
  const { refreshUserData, userData } = useContext(AuthContext);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // If user data already has a teamId, redirect to team page
  useEffect(() => {
    if (userData && userData.teamId) navigate("/user/team");
  }, [userData, navigate]);

  const persistToDB = async (teamId) => {
    const auth = getAuth();
    const userCredential = auth.currentUser;

    if (!userCredential || !userCredential.uid) {
      setError("You must be signed in to join a team.");
      return;
    }

    try {
      // only the name is read: someone joining is not a member yet, so the
      // rules do not let them read the whole team node
      const nameSnapshot = await get(ref(database, `teams/${teamId}/name`));

      if (!nameSnapshot.exists()) {
        setError(`No team found with the ID "${teamId}".`);
        return;
      }

      // add just this member rather than rewriting the whole list, so joining
      // cannot drop or reorder anyone else
      await set(ref(database, `teams/${teamId}/members/${userCredential.uid}`), true);

      // Attach teamId to user's profile
      await set(ref(database, `competitors/${userCredential.uid}/teamId`), teamId);

      await refreshUserData();

      return navigate("/user/team");
    } catch (err) {
      console.error("Error adding user to team:", err);
      setError("Could not join that team. Please try again.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || !inputValue.trim()) return;
    setBusy(true);
    setError("");
    try {
      await persistToDB(inputValue.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout maxWidth="xs">
      <Typography variant="h1" gutterBottom>
        Join a team
      </Typography>

      <Card>
        <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Team ID"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                helperText="Ask a teammate for the ID shown on their team page."
                autoFocus
                fullWidth
              />
              {error && <Alert severity="error">{error}</Alert>}
              <Button type="submit" variant="contained" disabled={busy || !inputValue.trim()}>
                {busy ? "Joining…" : "Join team"}
              </Button>
              <Link
                component={RouterLink}
                to="/user/team/create"
                variant="body2"
                sx={{ textAlign: "center" }}
              >
                Create a new team instead
              </Link>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Layout>
  );
}

export default NewJoinTeam;
