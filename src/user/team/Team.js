import Layout from "../Layout";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../../App";
import { Typography } from "@mui/material";
import { ref, get } from "firebase/database";
import { database } from "../../firebase";
import { Link } from "react-router-dom";

function Profile() {
    const { userData } = useContext(AuthContext);
    const [teamData, setTeamData] = useState(null);

    // Get team ID from userData if available
    const teamId = userData ? userData.teamId : null;

    // Fetch team data from Firebase if teamId is available
    useEffect(() => {
        const fetchTeamData = async () => {
            if (!teamId) {
                return;
            }

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
                userData ? (
                    <div style={{ textAlign: 'center' }}>
                        <Typography variant="h5" style={{ fontWeight: 'bold' }}>
                            {teamId}
                        </Typography>
                        <hr />
                        { /* Display team members or other relevant information here */}
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
                    </div>
                ) : (
                    <p>No user data found. Please contact HooHacks at <a href="mailto:support@hoohacks.com">support@hoohacks.com</a></p>
                )
            }
        </Layout>
    );
}

export default Profile;
