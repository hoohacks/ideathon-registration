import { ref, get, set } from "firebase/database";
import { database } from "../../firebase.js"; 

export async function getJudgeSchedule() {

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
        
        // fetch teams
        const teamsRef = ref(database, 'teams');
        const teamSnapshot = await get(teamsRef);

        if (!teamSnapshot.exists()) {
            console.log("No data available");
            return [];
        }
        
        const teamData = teamSnapshot.val();
        const teamsList = Object.entries(teamData).map(([id, details]) => ({ id, ...details }));
        
        // step 1: initialize assignments with empty arrays
        const assignmentsDict = {};
        for (const judge of judgesList) {
            assignmentsDict[judge.id] = []; // each judge gets 2 slots total
        }

        // round 1
        let round1Assignments = {};
        teamsList.forEach(team => {
            round1Assignments[team.name] = [];
        });

        judgesList.forEach((judge, index) => {
            const teamIndex = index % teamsList.length;
            const teamName = teamsList[teamIndex].name;
            round1Assignments[teamName].push(judge.id);
            assignmentsDict[judge.id].push(teamName);
        });
        
        // round 2, shift each team index by 1 to the right then just repeat the same logic
        let round2Assignments = {};
        teamsList.forEach(team => {
            round2Assignments[team.name] = [];
        });

        judgesList.forEach((judge, index) => {
            const teamIndex = (index + 1) % teamsList.length; // shift by 1
            const teamName = teamsList[teamIndex].name;
            round2Assignments[teamName].push(judge.id);
            assignmentsDict[judge.id].push(teamName);
        });

        // write all the team names to the judges in the db under the new attribute teamAssignments
        try {
            const writes = Object.entries(assignmentsDict).map(async ([judgeId, teams]) => {
                const judgeRef = ref(database, `judges/${judgeId}/teamAssignments`);
                const value = teams.length > 0 ? teams : [""]; // write empty array as [""]
                return set(judgeRef, value);
            });
            await Promise.all(writes);
            console.log("Successfully wrote team assignments to judges in the database.");
        } catch (error) {
            console.error("Error writing team assignments to judges in firebase:", error);
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

export default getJudgeSchedule;