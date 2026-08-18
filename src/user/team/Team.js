import Layout from "../Layout";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../../App";
import { ref, get, set, onValue } from "firebase/database";
import { database, storage } from "../../firebase";
import { Link, useNavigate } from "react-router-dom";
import { memberIds } from "./teamMembers";
import { uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { ref as storageRef } from "firebase/storage";
import {
    Box,
    Modal,
    Button,
    Typography,
    TextField,
    FormControl,
    FormHelperText,
} from "@mui/material";

function Team() {
    const navigate = useNavigate();
    const { userData, userCredential, refreshUserData } = useContext(AuthContext);
    const [teamData, setTeamData] = useState(null);
    const [uploadPitchDeck, setUploadPitchDeck] = useState(null);
    const [pitchDeckName, setPitchDeckName] = useState("");
    const [uploadProgress, setUploadProgress] = useState(null);
    const [uploadError, setUploadError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [ideaName, setIdeaName] = useState(userData ? userData.ideaName : "");
    const [problemStatement, setProblemStatement] = useState(userData ? userData.problemStatement : "");
    const [targetIndustry, setTargetIndustry] = useState(userData ? userData.targetIndustry : "");
    const [showModal, setShowModal] = useState(false);
    const [finalRound, setFinalRound] = useState({ active: false });


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
                setUploadProgress(
                    (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                );
            },
            (error) => {
                console.error("Pitch deck upload failed:", error);
                setUploadError("The pitch deck failed to upload. Please try again.");
                setUploadProgress(null);
            },
            () => setUploadProgress(100)
        );

        // set synchronously: this used to happen only inside the progress
        // callback, so submitting straight after picking a file saw no upload
        // task and saved the submission with no pitch deck URL at all
        setUploadPitchDeck(uploadResumeToDB);
        setUploadError("");
        setPitchDeckName(event.target.files[0].name);
    }

    const handleSubmitProject = async () => {
        if (submitting) return;
        if (!ideaName.trim() || !problemStatement.trim() || !targetIndustry.trim()) {
            setUploadError("Please fill in the idea name, problem statement and target industry.");
            return;
        }

        const existingURL = teamData?.submission?.pitchDeckURL ?? null;
        if (!uploadPitchDeck && !existingURL) {
            setUploadError("Please upload a pitch deck before submitting.");
            return;
        }

        setSubmitting(true);
        setUploadError("");
        try {
            let pitchDeckURL = existingURL;
            let deckName = teamData?.submission?.pitchDeckName ?? pitchDeckName;

            if (uploadPitchDeck) {
                // await the task itself rather than trusting a progress counter
                await uploadPitchDeck;
                pitchDeckURL = await getDownloadURL(uploadPitchDeck.snapshot.ref);
                deckName = pitchDeckName;
            }

            await set(ref(database, `teams/${teamId}/submission`), {
                ideaName,
                problemStatement,
                targetIndustry,
                pitchDeckName: deckName,
                pitchDeckURL,
            });
            // only after the details land, so a team is never marked submitted
            // with nothing to show
            await set(ref(database, `teams/${teamId}/submitted`), true);

            setShowModal(true);
        } catch (error) {
            console.error("Could not save the submission:", error);
            setUploadError("Your submission could not be saved. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    const handleLeaveTeam = async () => {
        const uid = userCredential.user.uid;

        // remove only this member, which is all the rules allow and all that
        // is needed
        await set(ref(database, `teams/${teamId}/members/${uid}`), null);

        // Remove teamId from user's profile
        await set(ref(database, `competitors/${uid}/teamId`), null);

        await refreshUserData();

        navigate('/user/team');
    }

    useEffect(() => {
        const finalRoundRef = ref(database, "finalRound");
        const unsubscribe = onValue(finalRoundRef, (snapshot) => {
            setFinalRound(snapshot.exists() ? snapshot.val() : { active: false });
        });
        return () => unsubscribe();
    }, []);

    // Fetch team data from Firebase if teamId is available
    useEffect(() => {
        if (!teamId) return;
        const teamRef = ref(database, "teams/" + teamId);
        const unsubscribe = onValue(teamRef, async (snapshot) => {
            if (!snapshot.exists())
                return;

            // Map member UIDs to names
            const members = memberIds(snapshot.val().members);
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

            setIdeaName(teamData.submission?.ideaName || "");
            setProblemStatement(teamData.submission?.problemStatement || "");
            setTargetIndustry(teamData.submission?.targetIndustry || "");
            setPitchDeckName(teamData.submission?.pitchDeckName || "");
            setTeamData(teamData);
        });
        return () => unsubscribe();
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
                            {
                                teamData.schedule ? (
                                    <>
                                        <Typography variant="h6" style={{ fontWeight: 'bold' }}>
                                            Pitch Presentation Details
                                        </Typography>
                                        <Typography variant="body1">
                                            Time: {teamData.schedule.time} <br />
                                            Room: {teamData.schedule.room}
                                        </Typography>
                                        <hr />
                                        {finalRound?.active && finalRound?.teams?.[teamId] ? (
                                            <>
                                                <Typography variant="h6" style={{ fontWeight: 'bold' }}>
                                                    Final Round Details
                                                </Typography>
                                                <Typography variant="body1">
                                                    Time: {finalRound.teams[teamId].timeslot} <br />
                                                    Room: {finalRound.teams[teamId].room}
                                                </Typography>
                                            </>
                                        ) : null}
                                    </>
                                ) : <>
                                    <Typography variant="h5" style={{ fontWeight: 'bold' }}>
                                        Project Submission
                                    </Typography>
                                    { /* Idea Name */}
                                    <FormControl fullWidth margin="normal">
                                        {/* <InputLabel htmlFor="problem-statement">Problem Statement</InputLabel> */}
                                        <TextField
                                            id="idea-name"
                                            label="Idea Name"
                                            value={ideaName}
                                            onChange={(e) => setIdeaName(e.target.value)}
                                        />
                                    </FormControl>
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

                                    {uploadProgress !== null && uploadProgress < 100 ? (
                                        <Typography variant="body2">
                                            Uploading pitch deck… {Math.round(uploadProgress)}%
                                        </Typography>
                                    ) : null}
                                    {uploadError ? (
                                        <Typography variant="body2" color="error">
                                            {uploadError}
                                        </Typography>
                                    ) : null}

                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleSubmitProject}
                                        disabled={submitting}
                                    >
                                        {submitting ? "Saving…" : "Save Project Submission"}
                                    </Button>
                                </>
                            }
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

export default Team;
