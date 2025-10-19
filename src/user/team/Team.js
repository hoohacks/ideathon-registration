import Layout from "../Layout";
import { useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../../App";
import { ref, get, set } from "firebase/database";
import { database, storage } from "../../firebase";
import { Link, useNavigate } from "react-router-dom";
import { uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { ref as storageRef } from "firebase/storage";
import {
    Box,
    Modal,
    Button,
    Typography,
    InputLabel,
    TextField,
    Select,
    MenuItem,
    LinearProgress,
    Checkbox,
    FormControlLabel,
    FormGroup,
    FormControl,
    Grid,
    RadioGroup,
    Radio,
    FormHelperText,
} from "@mui/material";

function Profile() {
    const navigate = useNavigate();
    const { userData, userCredential, refreshUserData } = useContext(AuthContext);
    const [teamData, setTeamData] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadPitchDeck, setUploadPitchDeck] = useState(null);
    const [pitchDeckName, setPitchDeckName] = useState("");
    const [isPitchDeckPicked, setIsPitchDeckPicked] = useState(false);
    const [problemStatement, setProblemStatement] = useState(userData ? userData.problemStatement : "");
    const [targetIndustry, setTargetIndustry] = useState(userData ? userData.targetIndustry : "");
    const [showModal, setShowModal] = useState(false);


    // Get team ID from userData if available
    const teamId = userData ? userData.teamId : null;

    const uploadFileToFirebase = (event) => {
        if (!event.target.files[0]) return;

        const storageReference = storageRef(
            storage,
            `teams/${teamId}/${event.target.files[0].name}`
        );
        const uploadResumeToDB = uploadBytesResumable(
            storageReference,
            event.target.files[0]
        );
        uploadResumeToDB.on(
            "state_changed",
            (snapshot) => {
                const progress =
                    (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log("Upload is " + progress + "% done");
                setUploadProgress(progress);
                setUploadPitchDeck(uploadResumeToDB);
            });

        setPitchDeckName(event.target.files[0].name);
        setIsPitchDeckPicked(true);
    }

    const handleSubmitProject = async () => {
        if (!pitchDeckName || !problemStatement.trim() || !targetIndustry.trim()) {
            alert("Please fill in all fields and upload a pitch deck before submitting.");
            return;
        }

        if (uploadPitchDeck) {
            // Wait for upload to complete
            await uploadPitchDeck;
            const downloadURL = await getDownloadURL(uploadPitchDeck.snapshot.ref);
            console.log("File available at", downloadURL);

            // Save project submission data to Firebase
            await set(ref(database, `teams/${teamId}/submission`), {
                problemStatement,
                targetIndustry,
                pitchDeckName,
                pitchDeckURL: downloadURL
            });
            await set(ref(database, `teams/${teamId}/submitted`), true);

            setShowModal(true);
        } else {
            // Pitch deck not changed, just update other fields
            await set(ref(database, `teams/${teamId}/submission`), {
                problemStatement,
                targetIndustry,
                pitchDeckName: teamData.submission.pitchDeckName,
                pitchDeckURL: teamData.submission.pitchDeckURL
            });
            await set(ref(database, `teams/${teamId}/submitted`), true);

            setShowModal(true);
        }
    }

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
            const teamData = { ...snapshot.val(), memberNames };

            setProblemStatement(teamData.submission.problemStatement || "");
            setTargetIndustry(teamData.submission.targetIndustry || "");
            setPitchDeckName(teamData.submission.pitchDeckName || "");
            setTeamData(teamData);
        };
        fetchTeamData();
    }, [teamId]);

    if (!teamId) {
        return (
            <Layout>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                    <div>
                        You are not currently part of a team. Please <Link to="/user/team/join">join</Link> or <Link to="/user/team/create">create</Link> a team to view team information.
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <>
            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                aria-labelledby="modal-modal-title"
                aria-describedby="modal-modal-description"
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                <Box sx={{ bgcolor: 'background.paper', border: '1px solid black', outline: 'none', boxShadow: 24, p: 4, width: 400 }}>
                    <Typography id="modal-modal-title" variant="h6" component="h2">
                        A round of applause! 🎉
                    </Typography>
                    <Typography id="modal-modal-description" sx={{ mt: 2 }}>
                        you have successfully submitted your project! You can always come back to this page to update your submission before the deadline.
                    </Typography>
                </Box>
            </Modal>
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
                            <Typography variant="h5" style={{ fontWeight: 'bold' }}>
                                Project Submission
                            </Typography>

                            { /* Problem Statement - Give a quick description as to what problem your project aims to solve and why it is important */}
                            <FormControl fullWidth margin="normal">
                                {/* <InputLabel htmlFor="problem-statement">Problem Statement</InputLabel> */}
                                <TextField
                                    id="problem-statement"
                                    multiline
                                    label="Problem Statement"
                                    minRows={3}
                                    value={problemStatement}
                                    onChange={(e) => setProblemStatement(e.target.value)}
                                    helperText="Give a quick description as to what problem your project aims to solve and why it is important."
                                />
                            </FormControl>
                            { /* Which industry or industries does your idea primarily target? (e.g., Technology, Finance, Healthcare, Energy, Fitness, etc.) */}
                            <Box>
                                <FormControl fullWidth margin="normal">
                                    <TextField
                                        id="target-industry"
                                        multiline
                                        label="Target Industry"
                                        minRows={2}
                                        value={targetIndustry}
                                        onChange={(e) => setTargetIndustry(e.target.value)}
                                        helperText="e.g., Technology, Finance, Healthcare, Energy, Fitness, etc."
                                    />
                                </FormControl>
                            </Box>

                            { /* Upload your pitch slide deck (in .ppt/.pptx format) */}
                            <Box mb={2}>
                                <FormControl fullWidth margin="normal">
                                    <Button
                                        variant="outlined"
                                        component="label"
                                    >
                                        {pitchDeckName || "Upload Pitch Deck (.ppt/.pptx)"}
                                        <input
                                            type="file"
                                            size="large"
                                            hidden={true}
                                            accept=".ppt,.pptx"
                                            onChange={(e) => uploadFileToFirebase(e)}
                                        />
                                    </Button>
                                    <FormHelperText>Upload your pitch slide deck (in .ppt/.pptx format).</FormHelperText>
                                </FormControl>
                            </Box>

                            <Button variant="contained" color="primary" onClick={handleSubmitProject}>
                                Save Project Submission
                            </Button>
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
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
                            Loading team information...
                        </div>
                    )
                }
            </Layout>
        </>
    );
}

export default Profile;
