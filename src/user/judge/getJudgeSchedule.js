import { ref, get } from "firebase/database";
import { database } from "../../firebase"; 

export async function getJudgeSchedule() {


    try {

        const judgesRef = ref(database, 'judges');
        const snapshot = await get(judgesRef);

        if (!snapshot.exists()) {
            console.log("No data available");
            return [];
        }

        const data = snapshot.val();

        const judgesList = Object.entries(data).map(([id, details]) => ({ id, ...details }));
        return judgesList;

    } catch (error) {
        console.error("Error fetching judge schedule:", error);
        return [];
    }
}

export default getJudgeSchedule;