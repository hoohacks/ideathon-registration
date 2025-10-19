import { ref, get, set } from "firebase/database";
import { database } from "../../firebase.js"; 

export async function removeJudgeSchedule() {

    try {

        // fetch judges
        const judgesRef = ref(database, 'judges');
        const judgeSnapshot = await get(judgesRef);

        if (!judgeSnapshot.exists()) {
            console.log("No data available");
            return [];
        }

        const judgeData = judgeSnapshot.val();
        const judgesList = Object.entries(judgeData).map(([id, details]) => ({ id, ...details }));
        
        
        // fill assignments with empty arrays
        const assignmentsDict = {};
        for (const judge of judgesList) {
            assignmentsDict[judge.id] = []; // each judge gets 2 slots total
        }

        judgesList.forEach((judge) => {
            assignmentsDict[judge.id].push("");
        });

        // write all the team names to the judges in the db under the new attribute teamAssignments
        try {
            const writes = Object.entries(assignmentsDict).map(async ([judgeId]) => {
                const judgeRef = ref(database, `judges/${judgeId}/teamAssignments`);
                const value = [""];
                return set(judgeRef, value);
            });
            await Promise.all(writes);
            console.log("Successfully cleared team assignments from judges in the database.");
        } catch (error) {
            console.error("Error clearing team assignments to judges in firebase:", error);
        }

        // new judge snapshot after writing assignments
        const updatedJudgeSnapshot = await get(judgesRef);
        const updatedJudgeData = updatedJudgeSnapshot.val();
        const updatedJudgesList = Object.entries(updatedJudgeData).map(([id, details]) => ({ id, ...details }));

        // prepares final output for frontend
        const assignments = updatedJudgesList.map(judge => ({
            judgeName: judge.firstName + " " + judge.lastName,
            teamAssignments: judge.teamAssignments || []
        }));

        // output of assignments: [{judgeName: "Param Patel", teamAssignments: ["Team A", "Team B"]}, ...]
        return assignments;

    } catch (error) {
        console.error("Error fetching judge schedule:", error);
        return {judges: [], teams: [], assignments: []};
    }

}

export default removeJudgeSchedule;