import getJudgeSchedule from "./getJudgeSchedule.js"; // adjust path if needed

async function test() {
  console.log("Fetching judge schedule...");

  const schedule = await getJudgeSchedule();

  console.log("Fetched schedule:", schedule);
  console.log("Number of judges:", schedule.length);
}

test();