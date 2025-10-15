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
        
        // assign each judge to a team (round-robin)
        const assignmentsDict = {};

        // giving each judge an empty array of assignments
        for (const j of judgesList) {
            assignmentsDict[j.id] = [];
        }

        // round-robin algorithm
        teamsList.forEach((team, index) => {
            const judgeIndex = index % judgesList.length;
            const judgeKey = judgesList[judgeIndex].id;
            assignmentsDict[judgeKey].push(team);
        });

        // write all the team names to the judges in the db under the new attribute teamAssignments
        try {
            const writes = Object.entries(assignmentsDict).map(async ([judgeId, teams]) => {
                const judgeRef = ref(database, `judges/${judgeId}/teamAssignments`);
                const teamNames = teams.map(team => team.name);
                
                // persist to db
                const value = teamNames.length > 0 ? teamNames : [""]; // write empty array as [""] so it still shows up in firebase
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