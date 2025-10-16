import React, { useState, useEffect } from "react";
import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import GenerateSchedule from "./GenerateSchedule";
import { getJudgeSchedule } from "./getJudgeSchedule";
import { getPersonalSchedule } from "./getPersonalSchedule";
import { readGenerateScheduleFlag, writeGenerateScheduleFlag } from "./generateScheduleFlag";
import ScoreSubmission from "./ScoreSubmission";
import { useAuth } from "../../App";
import "./Assigments.css";
import {
  findTeamIdByName,
  writeTeamScore,
  getMyScoredTeamsByName,
} from "./getTeamInfo";

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
  const [generated, setGenerated] = useState(true);
  const [generateFlag, setGenerateFlag] = useState(true);
  const [personalAssignments, setPersonalAssignments] = useState([]);
  const [scoredTeamNames, setScoredTeamNames] = useState(new Set());

  async function handleGenerateClick() {
    if (generated) return; // already generated once
    try {
      const assignments = await getJudgeSchedule();
      console.log("Generated schedule:", assignments);
      setGenerated(true);

      await writeGenerateScheduleFlag(true);
      setGenerateFlag(true);
    } catch (err) {
      console.error("Error generating schedule:", err);
    } finally {
      setGenerating(false);
    }
  }

  async function handleUndoToggle() {
    try {
      await writeGenerateScheduleFlag(false);
      setGenerateFlag(false);
      setGenerated(false);
    } catch (err) {
      console.error('Failed toggling generate flag', err);
    }
  }

  useEffect(() => {
    async function fetchPersonal() {
      try {
        const teams = await getPersonalSchedule();
        console.log("Personal assignments for judge", teams);
        setPersonalAssignments(teams || []);
        if (teams?.length) {
          const scoredMap = await getMyScoredTeamsByName(teams);
          setScoredTeamNames(new Set(Object.keys(scoredMap)));
        } else {
          setScoredTeamNames(new Set());
        }
      } catch (err) {
        console.error("Error fetching personal schedule:", err);
      }
    }

    fetchPersonal();
  }, []);

  // read the generate flag 
  useEffect(() => {
    async function fetchFlag() {
      try {
        const val = await readGenerateScheduleFlag();
        setGenerateFlag(Boolean(val));
      } catch (err) {
        console.error('Failed reading generate schedule flag', err);
      }
    }
    fetchFlag();
  }, []);

  async function handleSubmit(scores) {
    try {
      // selected has teamName/room/time from ScheduleCard
      const teamName = selected?.teamName;
      if (!teamName) throw new Error("No team selected");

      // if you already submitted a score, don't allow to resubmit
      if (scoredTeamNames.has(teamName)) {
        alert(`You already submitted a score for ${teamName}`);
        return;
      }

      // find the teamId
      const teamId = await findTeamIdByName(teamName);
      if (!teamId) {
        alert(`Could not find teamId for "${teamName}"`);
        return;
      }

      // write the score
      await writeTeamScore({ teamId, teamName, score: scores });

      // update scored keys
      setScoredTeamNames((prev) => new Set(prev).add(teamName));

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

  const { userTypes } = useAuth();
  const canManageSchedule = userTypes.includes("admin");
  const canViewAssignments = userTypes.includes("judge");

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <GenerateSchedule
              onButtonClick={handleGenerateClick}
              disabled={generating || generated || generateFlag}
            />
            <button
              className="undo-generate-schedule-button"
              type="button"
              onClick={handleUndoToggle}
              disabled={!generateFlag}
            >
              Undo Generated Schedule
            </button>
          </div>
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
                      disabled={scoredTeamNames.has(teamName)}
                    />
                  ))
                )}
              </div>
            </div>
          </>
        )}
        {!canViewAssignments && (
          <p className="assignments__empty">
            You do not have assigned judging duties.
          </p>
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
