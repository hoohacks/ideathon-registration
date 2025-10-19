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
import {
  activateFinalRound,
  deactivateFinalRound,
  subscribeToFinalRoundState,
} from "./finalRoundService";

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
  const [finalRoundState, setFinalRoundState] = useState({ active: false });
  const [finalRoundLoading, setFinalRoundLoading] = useState(true);
  const [togglingFinalRound, setTogglingFinalRound] = useState(false);
  const [finalRoundError, setFinalRoundError] = useState(null);

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

  async function handleActivateFinalRound() {
    setTogglingFinalRound(true);
    setFinalRoundError(null);
    try {
      await activateFinalRound();
    } catch (err) {
      console.error("Failed to activate final round:", err);
      setFinalRoundError(err.message || "Failed to activate final round.");
      alert(`Failed to activate final round: ${err.message}`);
    } finally {
      setTogglingFinalRound(false);
    }
  }

  async function handleDeactivateFinalRound() {
    const confirmed = window.confirm(
      "Deactivate final round judging? This will hide final-round assignments until reactivated."
    );
    if (!confirmed) return;

    setTogglingFinalRound(true);
    setFinalRoundError(null);
    try {
      await deactivateFinalRound();
    } catch (err) {
      console.error("Failed to deactivate final round:", err);
      setFinalRoundError(err.message || "Failed to deactivate final round.");
      alert(`Failed to deactivate final round: ${err.message}`);
    } finally {
      setTogglingFinalRound(false);
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
      const teamId =
        selected?.teamId ?? (await findTeamIdByName(teamName));
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

  useEffect(() => {
    const unsubscribe = subscribeToFinalRoundState((state) => {
      setFinalRoundState(state || { active: false });
      setFinalRoundLoading(false);
      setFinalRoundError(state?.error ?? null);
    });
    return () => unsubscribe();
  }, []);

  const finalRoundTeams = useMemo(() => {
    if (!finalRoundState?.active || !finalRoundState?.teams) return [];
    return Object.entries(finalRoundState.teams).map(([teamId, details]) => ({
      teamId,
      name: details?.name ?? "Unnamed Team",
      averageScore: details?.averageScore ?? null,
      excludedJudges: details?.excludedJudges ?? {},
    }));
  }, [finalRoundState]);

  const { userTypes, userCredential } = useAuth();
  const currentUserId = userCredential?.user?.uid;
  const userRoles = Array.isArray(userTypes) ? userTypes : [];
  const canManageSchedule = userRoles.includes("admin");
  const canViewAssignments = userRoles.includes("judge");

  const finalAssignmentsForJudge = useMemo(() => {
    if (!finalRoundTeams.length || !currentUserId) return [];
    return finalRoundTeams.filter(
      (team) => !team.excludedJudges?.[currentUserId]
    );
  }, [finalRoundTeams, currentUserId]);

  const finalRoundTeamNamesForJudge = useMemo(() => {
    return finalAssignmentsForJudge
      .map((team) => team.name)
      .filter((name) => Boolean(name));
  }, [finalAssignmentsForJudge]);

  useEffect(() => {
    async function fetchFinalRoundScores() {
      try {
        if (!finalRoundState?.active || finalRoundTeamNamesForJudge.length === 0) {
          setFinalRoundScoredTeamNames(new Set());
          return;
        }
        const scoredMap = await getMyFinalRoundScoredTeamsByName(
          finalRoundTeamNamesForJudge
        );
        const keys = scoredMap ? Object.keys(scoredMap) : [];
        setFinalRoundScoredTeamNames(new Set(keys));
      } catch (err) {
        console.error("Error fetching final round scores:", err);
      }
    }

    fetchFinalRoundScores();
  }, [finalRoundState?.active, finalRoundTeamNamesForJudge]);

  const finalRoundAssignments = finalAssignmentsForJudge.map((team) => {
    const firstRoundIndex = personalAssignments.indexOf(team.name);
    const derivedRoom =
      firstRoundIndex >= 0 ? `Room ${firstRoundIndex + 1}` : "Final Room";
    return {
      teamId: team.teamId,
      teamName: team.name,
      room: derivedRoom,
      time: "TBD",
    };
  });

  return (
    <Layout>
      <div className="judging-page">
        <h1>Judge Assignments</h1>
        {canManageSchedule && (
          <>
            <div className="assignments__admin-controls">
              <GenerateSchedule
                onButtonClick={handleGenerateClick}
                disabled={generating || generated}
              />
              {finalRoundState?.active ? (
                <>
                  <button
                    type="button"
                    className="assignments__toggle-button assignments__toggle-button--disabled"
                    disabled
                  >
                    Final Round Active
                  </button>
                  <button
                    type="button"
                    className="assignments__toggle-button assignments__toggle-button--danger"
                    onClick={handleDeactivateFinalRound}
                    disabled={togglingFinalRound || finalRoundLoading}
                  >
                    Deactivate Final Round
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="assignments__toggle-button"
                  onClick={handleActivateFinalRound}
                  disabled={togglingFinalRound || finalRoundLoading}
                >
                  Activate Final Round
                </button>
              )}
            </div>
            {finalRoundError && (
              <p className="assignments__error">{finalRoundError}</p>
            )}
          </>
        )}
        {canViewAssignments && (
          <>
            <div className="assignments__section">
              <h2 className="assignments__subheader">First Round</h2>
              <div className="assignments__row">
                {personalAssignments.length === 0 ? (
                  <div>No assignments yet</div>
                ) : (
                  personalAssignments.map((assignment, idx) => (
                    <ScheduleCard
                      key={`${assignment.teamName}-${idx}`}
                      teamName={assignment.teamName}
                      room={assignment.room}
                      time={assignment.time}
                      onButtonClick={(card) => openFor({ ...card, round: "first" })}
                      disabled={scoredTeamNames.has(assignment.teamName)}
                    />
                  ))
                )}
              </div>
            </div>
            {finalRoundState?.active && (
              <>
                <hr className="assignments__divider" />
                <div className="assignments__section">
                  <h2 className="assignments__subheader">Final Round</h2>
                  <div className="assignments__row">
                    {finalRoundAssignments.length === 0 ? (
                      <div>No final round assignments for you.</div>
                    ) : (
                      finalRoundAssignments.map((assignment) => {
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
                                ...card,
                                teamId: assignment.teamId,
                                round: "final",
                              })
                            }
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
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
