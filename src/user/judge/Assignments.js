import React, { useState, useEffect, useMemo } from "react";
import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import GenerateSchedule from "./GenerateSchedule";
import { getJudgeSchedule } from "./getJudgeSchedule";
import { getPersonalSchedule } from "./getPersonalSchedule";
import ScoreSubmission from "./ScoreSubmission";
import { useAuth } from "../../App";
import "./Assigments.css";
import {
  findTeamIdByName,
  writeTeamScore,
  writeFinalRoundScore,
  getMyScoredTeamsByName,
  getMyFinalRoundScoredTeamsByName,
} from "./getTeamInfo";

const FINAL_ROUND_TEST_TEAMS = ["Team 3", "Team 4"];

function Assignments() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);

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
  const [scoredTeamNames, setScoredTeamNames] = useState(() => new Set());
  const [finalRoundScoredTeamNames, setFinalRoundScoredTeamNames] = useState(
    () => new Set()
  );

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

  async function handleSubmit(scores) {
    try {
      // selected has teamName/room/time from ScheduleCard
      const teamName = selected?.teamName;
      if (!teamName) throw new Error("No team selected");

      // if you already submitted a score, don't allow to resubmit
      const isFinalRound = selected?.round === "final";

      if (!isFinalRound && scoredTeamNames.has(teamName)) {
        alert(`You already submitted a score for ${teamName}`);
        return;
      }
      if (isFinalRound && finalRoundScoredTeamNames.has(teamName)) {
        alert(`You already submitted a final round score for ${teamName}`);
        return;
      }

      // find the teamId
      const teamId = await findTeamIdByName(teamName);
      if (!teamId) {
        alert(`Could not find teamId for "${teamName}"`);
        return;
      }

      // write the score
      if (isFinalRound) {
        await writeFinalRoundScore({ teamId, teamName, score: scores });
      } else {
        await writeTeamScore({ teamId, teamName, score: scores });
      }

      // update scored keys
      if (isFinalRound) {
        setFinalRoundScoredTeamNames((prev) => {
          const copy = new Set(prev);
          copy.add(teamName);
          return copy;
        });
      } else {
        setScoredTeamNames((prev) => {
          const copy = new Set(prev);
          copy.add(teamName);
          return copy;
        });
      }

      alert(`Submitted scores for ${teamName}`);
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

  const finalRoundDisplayTeams = useMemo(() => {
    const matches = personalAssignments.filter((teamName) =>
      FINAL_ROUND_TEST_TEAMS.includes(teamName)
    );
    return matches.length > 0 ? matches : FINAL_ROUND_TEST_TEAMS;
  }, [personalAssignments]);

  useEffect(() => {
    async function fetchFinalRoundScores() {
      try {
        const uniqueNames = Array.from(
          new Set(finalRoundDisplayTeams.filter(Boolean))
        );
        if (uniqueNames.length === 0) {
          setFinalRoundScoredTeamNames(new Set());
          return;
        }
        const scoredMap = await getMyFinalRoundScoredTeamsByName(uniqueNames);
        const keys = scoredMap ? Object.keys(scoredMap) : [];
        setFinalRoundScoredTeamNames(new Set(keys));
      } catch (err) {
        console.error("Error fetching final round scores:", err);
      }
    }

    fetchFinalRoundScores();
  }, [finalRoundDisplayTeams]);

  const finalRoundAssignments = finalRoundDisplayTeams.map((teamName, idx) => {
    const firstRoundIndex = personalAssignments.indexOf(teamName);
    const derivedRoom =
      firstRoundIndex >= 0 ? `Room ${firstRoundIndex + 1}` : `Final Room ${idx + 1}`;
    return {
      teamName,
      room: derivedRoom,
      time: "TBD",
    };
  });

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
                      onButtonClick={(card) =>
                        openFor({
                          teamName: card.teamName,
                          room: card.room,
                          time: card.time,
                          round: "first",
                        })
                      }
                      disabled={scoredTeamNames.has(teamName)}
                    />
                  ))
                )}
              </div>
            </div>
            {<hr className="assignments__divider" />}
            {<div className="assignments__section">
              <h2 className="assignments__subheader">Final Round</h2>
              <div className="assignments__row">
                {finalRoundAssignments.map((assignment) => {
                  const isFinalScored = finalRoundScoredTeamNames.has(
                    assignment.teamName
                  );
                  return (
                    <ScheduleCard
                      key={`final-${assignment.teamName}`}
                      teamName={assignment.teamName}
                      room={assignment.room}
                      time={assignment.time}
                      disabled={isFinalScored}
                      onButtonClick={(card) =>
                        openFor({
                          teamName: card.teamName,
                          room: card.room,
                          time: card.time,
                          round: "final",
                        })
                      }
                    />
                  );
                })}
              </div>
            </div>}
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
