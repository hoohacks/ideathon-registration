import React, { useState, useEffect } from "react";
import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import GenerateSchedule from "./GenerateSchedule";
import { getJudgeSchedule } from "./getJudgeSchedule";
import { getPersonalSchedule } from "./getPersonalSchedule";
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
  const [personalAssignments, setPersonalAssignments] = useState([]);

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

  useEffect(() => {

    async function fetchPersonal() {
      try {
        const teams = await getPersonalSchedule();
        console.log("Personal assignments for judge", teams);
        setPersonalAssignments(teams || []);
      } catch (err) {
        console.error("Error fetching personal schedule:", err);
      }
    }

    fetchPersonal();
  }, []);

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
          {personalAssignments.length === 0 ? (
            <div>No assignments yet</div>
          ) : (
            personalAssignments.map((teamName, idx) => (
              <ScheduleCard
                key={`${teamName}-${idx}`}
                teamName={teamName}
                room={`Room ${idx + 1}`}
                time={`TBD`}
                onButtonClick={(card) => openFor(card)}
                disabled={!!scored[`${teamName}||Room ${idx + 1}`]}
              />
            ))
          )}
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
