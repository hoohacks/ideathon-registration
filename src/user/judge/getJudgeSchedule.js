import { ref, get, set, push } from "firebase/database";
import { database } from "../../firebase.js";

export async function getJudgeSchedule() {

    const rooms = [
        'Rice 103',
        'Rice 108',
        'Rice 109',
        'Rice 110',
        'TBD',
        'TBD',
        'TBD',
        'TBD',
    ]

    const batchTimes = {
        1: '5:00 PM',
        2: '5:15 PM'
    }

    try {

        // fetch judges
        const judgesRef = ref(database, 'judges');
        const judgeSnapshot = await get(judgesRef);

        if (!judgeSnapshot.exists()) {
            console.log("No data available");
            return [];
        }

        const judgeData = judgeSnapshot.val();
        const judgesList = Object.entries(judgeData)
            .filter(([_, details]) => (!details.isHooHacksMember && details.wantsToJudge) || (details.isHooHacksMember && details.isRound1Judge))
            .map(([id, details]) => ({ id, ...details }));

        // fetch teams
        const teamsRef = ref(database, 'teams');
        const teamSnapshot = await get(teamsRef);

        if (!teamSnapshot.exists()) {
            console.log("No data available");
            return [];
        }

        const teamData = teamSnapshot.val();
        const teamsList = Object.entries(teamData)
            // .filter(([_, details]) => details.submitted)
            .map(([id, details]) => ({ id, ...details }));

        // initialize assignments with empty arrays
        const assignmentsDict = {};
        for (const judge of judgesList) {
            assignmentsDict[judge.id] = []; // each judge gets 2 slots total
        }

        const teamAssignments = {};
        teamsList.forEach((team, index) => {
            const numTeamsPerBatch = Math.ceil(teamsList.length / 2);
            const batchNum = index < numTeamsPerBatch ? 1 : 2;
            const judgingAssignment = {
                teamName: teamsList[index].name,
                id: teamsList[index].id,
                room: rooms[index % numTeamsPerBatch],
                time: batchTimes[batchNum],
                batch: batchNum,
                judges: []
            };
            teamAssignments[team.id] = judgingAssignment;
        });

        // first wave of judging assignments, round 1
        judgesList.forEach((judge, index) => {
            const teamIndex = index % Math.ceil(teamsList.length / 2);
            const teamId = teamsList[teamIndex].id;
            assignmentsDict[judge.id].push(teamAssignments[teamId]);
            if (teamAssignments[teamId].batch !== 1) {
                console.error("Assignment batch mismatch in round 1");
            }
            teamAssignments[teamId].judges.push({
                judgeName: judge.firstName + " " + judge.lastName,
                judgeId: judge.id
            });
        });

        // second wave of judging assignments, round 2
        // assign with prime multiple mix up judge-team pairings
        judgesList.forEach((judge, index) => {
            const teamIndex = (index * 149) % Math.floor(teamsList.length / 2) + Math.ceil(teamsList.length / 2);
            console.log("Assigning judge", judge.id, "to team index", teamIndex);
            const teamId = teamsList[teamIndex].id;
            assignmentsDict[judge.id].push(teamAssignments[teamId]);
            if (teamAssignments[teamId].batch !== 2) {
                console.error("Assignment batch mismatch in round 2");
            }
            teamAssignments[teamId].judges.push({
                judgeName: judge.firstName + " " + judge.lastName,
                judgeId: judge.id
            });
        });

        // count number of violations (judge assigned to room with same judge from round 1)
        const prevSeenPairs = new Set();
        let violationCount = 0;
        Object.entries(teamAssignments).forEach(([teamId, assignment]) => {
            const judges = assignment.judges;
            for (let i = 0; i < judges.length; i++) {
                for (let j = i + 1; j < judges.length; j++) {
                    const pairKey = [judges[i].judgeId, judges[j].judgeId].sort().join("-");
                    if (prevSeenPairs.has(pairKey)) {
                        violationCount += 1;
                        console.log(`Violation detected: Judges ${judges[i].judgeId} and ${judges[j].judgeId} assigned together more than once.`);
                    } else {
                        prevSeenPairs.add(pairKey);
                    }
                }
            }
        });
        console.log(`Total judge-team assignment violations: ${violationCount}`);

        Object.entries(teamAssignments).forEach(([teamId, assignment]) => {
            console.log(`Team ${assignment.teamName} in room ${assignment.room} at ${assignment.time} has judges: ${assignment.judges.map(j => j.judgeName).join(", ")}`);
            console.log(`Total judges for team ${assignment.teamName}: ${assignment.judges.length}`);
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

        // write all team assignments to teams in the db under the new attribute schedule
        try {
            const writes = Object.entries(teamAssignments).map(async ([teamId, assignment]) => {
                const scheduleRef = ref(database, `teams/${teamId}/schedule`);
                console.log("Writing schedule for team:", teamId, assignment);
                return set(scheduleRef, assignment);
            });
            await Promise.all(writes);
            console.log("Successfully wrote judge assignments to teams in the database.");
        } catch (error) {
            console.error("Error writing judge assignments to teams in firebase:", error);
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
        return { judges: [], teams: [], assignments: [] };
    }

}

export default getJudgeSchedule;
