import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import GenerateSchedule from "./GenerateSchedule";
import ScoreSubmission from "./ScoreSubmission";
import "./Assigments.css";
import getJudgeSchedule from "./getJudgeSchedule";
import { use, useEffect } from "react";
import { get } from "firebase/database";

function Assignments() {

  // test for fetching judge list:
  useEffect(() => {
    async function fetchData() {
      const judges = await getJudgeSchedule();
      console.log("Judges:", judges);
    }
    fetchData();
  }, []);

  return (
    <Layout>
      <div className="judging-page">
        <h1>Judge Assignments</h1>
        <GenerateSchedule
          onButtonClick={() => {
            console.log("Generate Schedule");
            alert(`Generate Schedule Clicked`);
          }}
        />
        <div className="assignments__row">
          <ScheduleCard
            teamName="Fake Team"
            room="Rice 102"
            time="2:30 PM"
            onButtonClick={(card) => {
              <ScoreSubmission />;
            }}
          />
        </div>
      </div>
    </Layout>
  );
}

export default Assignments;
