import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  getMyScoredTeamIds,
  getMyFinalRoundScoredTeamIds,
} from "./getTeamInfo";
import {
  activateFinalRound,
  deactivateFinalRound,
  subscribeToFinalRoundState,
} from "./finalRoundService";

function Assignments() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function openFor(card) {
    setSelected(card);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSelected(null);
  }

  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState(null);
  const [personalAssignments, setPersonalAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  // scored teams are tracked by database id, never by name -- team names are
  // not unique and would collide
  const [scoredTeamIds, setScoredTeamIds] = useState(() => new Set());
  const [finalRoundScoredTeamIds, setFinalRoundScoredTeamIds] = useState(
    () => new Set()
  );
  const [finalRoundState, setFinalRoundState] = useState({ active: false });
  const [finalRoundLoading, setFinalRoundLoading] = useState(true);
  const [togglingFinalRound, setTogglingFinalRound] = useState(false);
  const [finalRoundError, setFinalRoundError] = useState(null);

  const { userTypes, userCredential } = useAuth();
  const currentUserId = userCredential?.user?.uid;
  const userRoles = Array.isArray(userTypes) ? userTypes : [];
  const canManageSchedule = userRoles.includes("admin");
  const canViewAssignments = userRoles.includes("judge");

  const loadPersonalSchedule = useCallback(async () => {
    if (!canViewAssignments) {
      setLoadingAssignments(false);
      return;
    }
    try {
      setLoadingAssignments(true);
      const teams = await getPersonalSchedule();
      setPersonalAssignments(teams ?? []);
      setScoredTeamIds(await getMyScoredTeamIds((teams ?? []).map((t) => t.id)));
    } catch (err) {
      console.error("Error fetching personal schedule:", err);
    } finally {
      setLoadingAssignments(false);
    }
  }, [canViewAssignments]);

  useEffect(() => {
    loadPersonalSchedule();
  }, [loadPersonalSchedule]);

  async function handleGenerateClick() {
    if (generating) return;
    if (generateResult?.ok) {
      const confirmed = window.confirm(
        "A schedule has already been generated. Regenerating replaces every judge and team assignment. Continue?"
      );
      if (!confirmed) return;
    }

    try {
      setGenerating(true);
      setGenerateResult(null);
      const result = await getJudgeSchedule();
      setGenerateResult(result);
      if (result.ok) await loadPersonalSchedule();
    } catch (err) {
      console.error("Error generating schedule:", err);
      setGenerateResult({
        ok: false,
        error: err.message || "Something went wrong generating the schedule.",
        warnings: [],
      });
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
    } finally {
      setTogglingFinalRound(false);
    }
  }

  async function handleSubmit(scores) {
    if (submitting) return;
    try {
      setSubmitting(true);

      const teamName = selected?.teamName;
      if (!teamName) throw new Error("No team selected");

      const isFinalRound = selected?.round === "final";
      const alreadyScored = isFinalRound
        ? finalRoundScoredTeamIds
        : scoredTeamIds;

      // schedules written before assignments carried an id fall back to a name
      // lookup, which is why duplicate team names are worth avoiding
      const teamId = selected?.teamId ?? (await findTeamIdByName(teamName));
      if (!teamId) {
        alert(`Could not find "${teamName}" in the database.`);
        return;
      }

      if (alreadyScored.has(teamId)) {
        alert(`You already submitted a score for ${teamName}`);
        return;
      }

      if (isFinalRound) {
        await writeFinalRoundScore({ teamId, teamName, score: scores });
        setFinalRoundScoredTeamIds((prev) => new Set(prev).add(teamId));
      } else {
        await writeTeamScore({ teamId, teamName, score: scores });
        setScoredTeamIds((prev) => new Set(prev).add(teamId));
      }

      alert(`Submitted scores for ${teamName}`);
      closeModal();
    } catch (e) {
      console.error(e);
      alert(`Failed to submit score: ${e.message}`);
    } finally {
      setSubmitting(false);
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
      room: details?.room ?? "TBD",
      timeslot: details?.timeslot ?? "TBD",
    }));
  }, [finalRoundState]);

  const finalAssignmentsForJudge = useMemo(() => {
    if (!finalRoundTeams.length || !currentUserId) return [];
    return finalRoundTeams.filter(
      (team) => !team.excludedJudges?.[currentUserId]
    );
  }, [finalRoundTeams, currentUserId]);

  const finalRoundTeamIdsForJudge = useMemo(
    () => finalAssignmentsForJudge.map((team) => team.teamId).filter(Boolean),
    [finalAssignmentsForJudge]
  );

  useEffect(() => {
    let cancelled = false;
    async function fetchFinalRoundScores() {
      try {
        if (!finalRoundState?.active || finalRoundTeamIdsForJudge.length === 0) {
          if (!cancelled) setFinalRoundScoredTeamIds(new Set());
          return;
        }
        const scored = await getMyFinalRoundScoredTeamIds(finalRoundTeamIdsForJudge);
        if (!cancelled) setFinalRoundScoredTeamIds(scored);
      } catch (err) {
        console.error("Error fetching final round scores:", err);
      }
    }

    fetchFinalRoundScores();
    return () => {
      cancelled = true;
    };
  }, [finalRoundState?.active, finalRoundTeamIdsForJudge]);

  const stats = generateResult?.ok ? generateResult.stats : null;

  return (
    <Layout>
      <div className="judging-page">
        <h1>Judge Assignments</h1>
        {canManageSchedule && (
          <>
            <div className="assignments__admin-controls">
              <GenerateSchedule
                onButtonClick={handleGenerateClick}
                busy={generating}
                generated={Boolean(generateResult?.ok)}
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
            {generateResult && !generateResult.ok && (
              <p className="assignments__error">{generateResult.error}</p>
            )}
            {generateResult?.warnings?.map((warning) => (
              <p className="assignments__warning" key={warning}>
                {warning}
              </p>
            ))}
            {stats && (
              <p className="assignments__notice">
                Scheduled {stats.teams} teams across {stats.judges} judges in
                batches of {stats.batchSizes.join(" / ")}, using{" "}
                {stats.roomsUsed} rooms. Each team sees{" "}
                {stats.minJudgesPerTeam === stats.maxJudgesPerTeam
                  ? stats.minJudgesPerTeam
                  : `${stats.minJudgesPerTeam}-${stats.maxJudgesPerTeam}`}{" "}
                judges.
              </p>
            )}
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
                {loadingAssignments ? (
                  <div>Loading your assignments...</div>
                ) : personalAssignments.length === 0 ? (
                  <div>No assignments yet</div>
                ) : (
                  personalAssignments.map((assignment, idx) => (
                    <ScheduleCard
                      key={assignment.id ?? `${assignment.teamName}-${idx}`}
                      teamId={assignment.id}
                      teamName={assignment.teamName}
                      room={assignment.room}
                      time={assignment.time}
                      onButtonClick={(card) => openFor({ ...card, round: "first" })}
                      disabled={scoredTeamIds.has(assignment.id)}
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
                    {finalAssignmentsForJudge.length === 0 ? (
                      <div>No final round assignments for you.</div>
                    ) : (
                      finalAssignmentsForJudge.map((team) => (
                        <ScheduleCard
                          key={`final-${team.teamId}`}
                          teamId={team.teamId}
                          teamName={team.name}
                          room={team.room}
                          time={team.timeslot}
                          disabled={finalRoundScoredTeamIds.has(team.teamId)}
                          onButtonClick={(card) =>
                            openFor({ ...card, round: "final" })
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
        {!canViewAssignments && !canManageSchedule && (
          <p className="assignments__empty">
            You do not have assigned judging duties.
          </p>
        )}
        {modalOpen && selected && (
          <ScoreSubmission
            teamName={selected.teamName}
            room={selected.room}
            time={selected.time}
            submitting={submitting}
            onClose={closeModal}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </Layout>
  );
}

export default Assignments;
