import { ref, get } from "firebase/database";
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
        
        // fetch team
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

        teamsList.forEach((team, index) => {
            const judgeIndex = index % judgesList.length;
            const judgeKey = judgesList[judgeIndex].id;
            assignmentsDict[judgeKey].push(team);
        });

        // converting assignmentsDict to an array of objects
        const assignments = Object.entries(assignmentsDict).map(([judgeId, teams]) => ({ judgeId, teams }));

        return {assignments: assignments};

    } catch (error) {
        console.error("Error fetching judge schedule:", error);
        return {judges: [], teams: [], assignments: []};
    }

}

export default getJudgeSchedule;