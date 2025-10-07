import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import GenerateSchedule from "./GenerateSchedule";
import ScoreSubmission from "./ScoreSubmission";

function Assignments() {
  return (
    <Layout>
      <h1>Judge Assignments</h1>
      <GenerateSchedule onButtonClick={() => {
            console.log("Generate Schedule");
            alert(`Generate Schedule Clicked`);
        }}
      />
      <ScheduleCard
        teamName="Fake Team"
        room="Rice 102"
        time="2:30 PM"
        onButtonClick={(card) => {
            <ScoreSubmission/>
        }}
      />
    </Layout>
  );
}

export default Assignments;
