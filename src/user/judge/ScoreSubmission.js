import "./ScheduleCard.css";
import { useState } from "react";

function ScoreSubmission({
  teamName = "Team Name",
  room = "Room 101",
  time = "10:00 AM",
  onButtonClick = () => {},
}) {
  const [scoreSubmitted, setScoreSubmitted] = useState(false);

  return (
    <div>
      <h1>Score Submission</h1>
      <h2>Team Information: </h2>
      <h3>Team Name: {teamName}</h3>
      <h3>Room: {room}</h3>
      <h3>Presentation time: {time}</h3>
      <form></form>
      <button
        type="button"
        className="schedule-card__button"
        disabled={scoreSubmitted}
        onClick={(e) => {
          // will call backend to submit score
          alert("Score submitted");
          onButtonClick({ teamName, room, time, event: e });
          setScoreSubmitted(true);
        }}
      >
        Submit Score
      </button>
    </div>
  );
}

export default ScoreSubmission;
