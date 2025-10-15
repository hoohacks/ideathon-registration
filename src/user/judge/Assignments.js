import React, { useState } from "react";
import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import GenerateSchedule from "./GenerateSchedule";
import { getJudgeSchedule } from "./getJudgeSchedule";
import ScoreSubmission from "./ScoreSubmission";
import "./Assigments.css";

function Assignments() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [scored, setScored] = useState({});

  function openFor(card) {
    console.log("Assignments.openFor called with", card);
    setSelected(card);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSelected(null);
  }

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  async function handleGenerateClick() {
    if (generated) return; // already generated once
    try {
      setGenerating(true);
      const assignments = await getJudgeSchedule();
      console.log("Generated schedule:", assignments);
      setGenerated(true);
    } catch (err) {
      console.error("Error generating schedule:", err);
    } finally {
      setGenerating(false);
    }
  }

  function handleSubmit(scores) {
    // log scores, IRL send to backend
    console.log("Submitted scores for", selected, scores);
    alert(`Submitted scores for ${selected?.teamName || "team"}`);

    // mark this team as scored so the card button can be disabled
    if (selected) {
      const key = `${selected.teamName}||${selected.room}`;
      setScored((prev) => ({ ...prev, [key]: true }));
    }

    closeModal();
  }

  return (
    <Layout>
      <div className="judging-page">
        <h1>Judging Assignments</h1>
        <GenerateSchedule
          onButtonClick={handleGenerateClick}
          disabled={generating || generated}
        />
        <div className="assignments__row">
          <ScheduleCard
            teamName="Fake Team"
            room="Rice 102"
            time="2:30 PM"
            onButtonClick={(card) => openFor(card)}
            disabled={!!scored["Fake Team||Rice 102"]}
          />
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
