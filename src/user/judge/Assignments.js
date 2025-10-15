import React, { useState, useEffect } from "react";
import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import GenerateSchedule from "./GenerateSchedule";
import { getJudgeSchedule } from "./getJudgeSchedule";
import { getPersonalSchedule } from "./getPersonalSchedule";
import ScoreSubmission from "./ScoreSubmission";
import { useAuth } from "../../App";
import "./Assigments.css";
import { findTeamIdByName, writeTeamScore } from "./getTeamInfo";


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


async function handleSubmit(scores) {
  try {
    // selected has teamName/room/time from ScheduleCard
    const teamName = selected?.teamName;
    if (!teamName) throw new Error("No team selected");

    // find the teamId
    const teamId = await findTeamIdByName(teamName);
    if (!teamId) {
      alert(`Could not find teamId for "${teamName}"`);
      return;
    }

    // write the score
    await writeTeamScore({ teamId, teamName, score: scores });

    alert(`Submitted scores for ${teamName}`);
    const key = `${teamName}||${selected.room}`;
    setScored((prev) => ({ ...prev, [key]: true }));
  } catch (e) {
    console.error(e);
    alert(`Failed to submit score: ${e.message}`);
  } finally {
    closeModal();
  }
}

  // function handleSubmit(scores) {
  //   console.log("Submitted scores for", selected, scores);
  //   alert(`Submitted scores for ${selected?.teamName || "team"}`);

  //   // mark this team as scored so the card button can be disabled
  //   if (selected) {
  //     const key = `${selected.teamName}||${selected.room}`;
  //     setScored((prev) => ({ ...prev, [key]: true }));
  //   }

  //   closeModal();
  // }

  const { userType } = useAuth();
  const canManageSchedule = userType === "admin";
  const canViewAssignments = userType === "judge";

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
        <h1>Judge Assignments</h1>
        {canManageSchedule && (
          <GenerateSchedule
            onButtonClick={handleGenerateClick}
            disabled={generating || generated}
          />
        )}
        {canViewAssignments && (
          <>
            <div className="assignments__section">
              <h2 className="assignments__subheader">First Round</h2>
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
            </div>
            <hr className="assignments__divider" />
            <div className="assignments__section">
              <h2 className="assignments__subheader">Final Round</h2>
              <div className="assignments__row">
                {finalRoundAssignments.map((assignment) => {
                  const key = `${assignment.teamName}||${assignment.room}`;
                  return (
                    <ScheduleCard
                      key={`final-${assignment.teamName}`}
                      teamName={assignment.teamName}
                      room={assignment.room}
                      time={assignment.time}
                      disabled={Boolean(scored[key])}
                      onButtonClick={openFor}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}
        {!canViewAssignments && (
          <p className="assignments__empty">You do not have assigned judging duties.</p>
        )}
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
