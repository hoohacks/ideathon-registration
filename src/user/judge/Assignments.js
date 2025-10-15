import React, { useState } from "react";
import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import GenerateSchedule from "./GenerateSchedule";
import ScoreSubmission from "./ScoreSubmission";
import "./Assigments.css";

function Assignments() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [scored, setScored] = useState({});

  function openFor(card) {
    console.log('Assignments.openFor called with', card);
    setSelected(card);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSelected(null);
  }

  function handleSubmit(scores) {
    // For now just log the scores. In a real app you'd send to backend.
    console.log("Submitted scores for", selected, scores);
    alert(`Submitted scores for ${selected?.teamName || "team"}`);

    // mark this team as scored so the card button can be disabled
    if (selected) {
      const key = `${selected.teamName}||${selected.room}`;
      setScored((prev) => ({ ...prev, [key]: true }));
    }

    closeModal();
  }
  const firstRoundAssignments = [
    {
      teamName: "Team Alpha",
      room: "Rice 102",
      time: "2:30 PM",
    },
  ];

  const finalRoundAssignments = [
    {
      teamName: "Team Omega",
      room: "Rice 201",
      time: "6:00 PM",
    },
  ];

  return (
    <Layout>
      <div className="judging-page">
        <h1>Judging Assignments</h1>
        <GenerateSchedule
          onButtonClick={() => {
            console.log("Generate Schedule");
            alert(`Generate Schedule Clicked`);
          }}
        />
        <div className="assignments__section">
          <h2 className="assignments__subheader">First Round</h2>
          <div className="assignments__row">
            {firstRoundAssignments.map((assignment) => (
              <ScheduleCard
                key={`first-${assignment.teamName}`}
                teamName={assignment.teamName}
                room={assignment.room}
                time={assignment.time}
                onButtonClick={(card) => {
                  <ScoreSubmission />;
                }}
              />
            ))}
          </div>
        </div>
        <hr className="assignments__divider" />
        <div className="assignments__section">
          <h2 className="assignments__subheader">Final Round</h2>
          <div className="assignments__row">
            {finalRoundAssignments.map((assignment) => (
              <ScheduleCard
                key={`final-${assignment.teamName}`}
                teamName={assignment.teamName}
                room={assignment.room}
                time={assignment.time}
                onButtonClick={(card) => {
                  <ScoreSubmission />;
                }}
              />
            ))}
          </div>
        </div>

        {modalOpen && selected && (
          <ScoreSubmission
            teamName={selected.teamName}
            room={selected.room}
            time={selected.time}
            onClose={closeModal}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </Layout>
  );
}

export default Assignments;
