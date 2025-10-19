import Layout from "../Layout";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../../App";
import { Button, Typography } from "@mui/material";
import { ref, get, set } from "firebase/database";
import { database } from "../../firebase";
import { Link, useNavigate } from "react-router-dom";

function Profile() {
    const navigate = useNavigate();
    const { userData, userCredential, refreshUserData } = useContext(AuthContext);
    const [teamData, setTeamData] = useState(null);

    // Get team ID from userData if available
    const teamId = userData ? userData.teamId : null;

    const handleLeaveTeam = async () => {
        const teamRef = ref(database, "teams/" + teamId);
        const snapshot = await get(teamRef);

        if (!snapshot.exists()) {
            alert(`Team with ID "${teamId}" does not exist.`);
            return;
        }

        // Remove user from team's member list
        const teamData = snapshot.val();
        let members = [];

        // Coerce existing members into an array if possible
        if (Array.isArray(teamData.members)) {
            members = teamData.members.filter(Boolean); // remove any null/undefined
        }

        // Remove current UID from the array
        const uid = userCredential.user.uid;
        members = members.filter(memberUid => memberUid !== uid);

        // Update the team in the database
        await set(ref(database, "teams/" + teamId + "/members"), members);

        // Remove teamId from user's profile
        await set(ref(database, `competitors/${uid}/teamId`), null);

        await refreshUserData();

        navigate('/user/team');
    }

    // Fetch team data from Firebase if teamId is available
    useEffect(() => {
        const fetchTeamData = async () => {
            const teamRef = ref(database, "teams/" + teamId);
            const snapshot = await get(teamRef);

            if (!snapshot.exists())
                return;

            // Map member UIDs to names
            const members = snapshot.val().members || [];
            const memberNames = await Promise.all(members.map(async (uid) => {
                const userRef = ref(database, `competitors/${uid}`);
                const userSnapshot = await get(userRef);
                if (userSnapshot.exists()) {
                    const userInfo = userSnapshot.val();
                    return `${userInfo.firstName} ${userInfo.lastName}`;
                }
                return "Unknown User";
            }));

            setTeamData({ ...snapshot.val(), memberNames });
        };
        fetchTeamData();
    }, [teamId]);

    if (!teamId) {
        return (
            <Layout>
                <Typography variant="body1" style={{ textAlign: 'center', marginTop: '20px' }}>
                    You are not currently part of a team. Please <Link to="/user/team/join">join</Link> or <Link to="/user/team/create">create</Link> a team to view team information.
                </Typography>
            </Layout>
        );
    }

    return (
        <Layout>
            <Typography variant="h4" gutterBottom style={{ fontWeight: 'bold', textAlign: 'center' }}>
                Team Information
            </Typography>
            {
                teamData ? (
                    <div style={{ textAlign: 'center' }}>
                        <Typography variant="h5" style={{ fontWeight: 'bold' }}>
                            {teamData.name}
                        </Typography>
                        <Typography variant="h6" style={{ fontStyle: 'italic' }}>
                            Team ID: {teamId}
                        </Typography>
                        <hr />
                        <Typography variant="h6" style={{ fontWeight: 'bold' }}>
                            Team Members
                        </Typography>
                        <ul style={{ listStyleType: 'none', padding: 0 }}>
                            {teamData && teamData.memberNames && teamData.memberNames.map((name, index) => (
                                <li key={index}>
                                    <Typography variant="body1">{name}</Typography>
                                </li>
                            ))}
                        </ul>
                        <hr />
                        <Button onClick={handleLeaveTeam} variant="outlined" color="secondary">
                            Leave Team
                        </Button>
                    </div>
                ) : (
                    <Typography variant="body1" style={{ textAlign: 'center', marginTop: '20px' }}>
                        Loading team information...
                    </Typography>
                )
            }
        </Layout>
    );
}

export default Profile;
