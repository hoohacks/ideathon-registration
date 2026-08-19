import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import { getJudgeSchedule } from "./getJudgeSchedule";
import { getPersonalSchedule } from "./getPersonalSchedule";
import ScoreSubmission from "./ScoreSubmission";
import { useAuth } from "../../App";
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

function Section({ title, caption, children }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1.5 }}>
        <Typography variant="h2">{title}</Typography>
        {caption && <Typography variant="body2">{caption}</Typography>}
      </Stack>
      {children}
    </Box>
  );
}

function Assignments() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

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
  const [finalRoundScoredTeamIds, setFinalRoundScoredTeamIds] = useState(() => new Set());
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
      "Deactivate final round judging? This hides final-round assignments until reactivated."
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
      const alreadyScored = isFinalRound ? finalRoundScoredTeamIds : scoredTeamIds;

      // schedules written before assignments carried an id fall back to a name
      // lookup, which is why duplicate team names are worth avoiding
      const teamId = selected?.teamId ?? (await findTeamIdByName(teamName));
      if (!teamId) {
        setToast({ severity: "error", message: `Could not find "${teamName}" in the database.` });
        return;
      }

      if (alreadyScored.has(teamId)) {
        setToast({ severity: "warning", message: `You already scored ${teamName}.` });
        return;
      }

      if (isFinalRound) {
        await writeFinalRoundScore({ teamId, teamName, score: scores });
        setFinalRoundScoredTeamIds((prev) => new Set(prev).add(teamId));
      } else {
        await writeTeamScore({ teamId, teamName, score: scores });
        setScoredTeamIds((prev) => new Set(prev).add(teamId));
      }

      setToast({ severity: "success", message: `Score submitted for ${teamName}.` });
      closeModal();
    } catch (e) {
      console.error(e);
      setToast({ severity: "error", message: `Could not submit: ${e.message}` });
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
    return finalRoundTeams.filter((team) => !team.excludedJudges?.[currentUserId]);
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
  const remaining = personalAssignments.filter((a) => !scoredTeamIds.has(a.id)).length;

  return (
    <Layout maxWidth="lg">
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={1}
        >
          <Typography variant="h1">Judging</Typography>
          {canViewAssignments && personalAssignments.length > 0 && (
            <Typography variant="body2">
              {remaining === 0
                ? "All teams scored"
                : `${remaining} of ${personalAssignments.length} left to score`}
            </Typography>
          )}
        </Stack>

        {canManageSchedule && (
          <Card sx={{ p: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Typography variant="h5" sx={{ flex: 1 }}>
                Run of show
              </Typography>
              <Button variant="contained" onClick={handleGenerateClick} disabled={generating}>
                {generating
                  ? "Generating…"
                  : generateResult?.ok
                  ? "Regenerate schedule"
                  : "Generate schedule"}
              </Button>
              {finalRoundState?.active ? (
                <Button
                  variant="outlined"
                  onClick={handleDeactivateFinalRound}
                  disabled={togglingFinalRound || finalRoundLoading}
                >
                  Deactivate final round
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  onClick={handleActivateFinalRound}
                  disabled={togglingFinalRound || finalRoundLoading}
                >
                  Activate final round
                </Button>
              )}
            </Stack>

            {(generateResult || finalRoundError || finalRoundState?.active) && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                {finalRoundState?.active && (
                  <Alert severity="info">Final round is active.</Alert>
                )}
                {generateResult && !generateResult.ok && (
                  <Alert severity="error">{generateResult.error}</Alert>
                )}
                {generateResult?.warnings?.map((warning) => (
                  <Alert severity="warning" key={warning}>
                    {warning}
                  </Alert>
                ))}
                {stats && (
                  <Alert severity="success">
                    Scheduled {stats.teams} teams across {stats.judges} judges in batches of{" "}
                    {stats.batchSizes.join(" / ")}, using {stats.roomsUsed} rooms. Each team
                    sees{" "}
                    {stats.minJudgesPerTeam === stats.maxJudgesPerTeam
                      ? stats.minJudgesPerTeam
                      : `${stats.minJudgesPerTeam}–${stats.maxJudgesPerTeam}`}{" "}
                    judges.
                  </Alert>
                )}
                {finalRoundError && <Alert severity="error">{finalRoundError}</Alert>}
              </Stack>
            )}
          </Card>
        )}

        {canViewAssignments && (
          <>
            <Section title="First round">
              {loadingAssignments ? (
                <Typography variant="body2">Loading your assignments…</Typography>
              ) : personalAssignments.length === 0 ? (
                <Card sx={{ p: 3 }}>
                  <Typography variant="body2" align="center">
                    No assignments yet. They appear once an admin generates the schedule.
                  </Typography>
                </Card>
              ) : (
                <Grid container spacing={2}>
                  {personalAssignments.map((assignment, idx) => (
                    <Grid item xs={12} sm={6} md={4} key={assignment.id ?? `${assignment.teamName}-${idx}`}>
                      <ScheduleCard
                        teamId={assignment.id}
                        teamName={assignment.teamName}
                        room={assignment.room}
                        time={assignment.time}
                        onButtonClick={(card) => openFor({ ...card, round: "first" })}
                        disabled={scoredTeamIds.has(assignment.id)}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
            </Section>

            {finalRoundState?.active && (
              <>
                <Divider />
                <Section title="Final round">
                  {finalAssignmentsForJudge.length === 0 ? (
                    <Card sx={{ p: 3 }}>
                      <Typography variant="body2" align="center">
                        No final round assignments for you.
                      </Typography>
                    </Card>
                  ) : (
                    <Grid container spacing={2}>
                      {finalAssignmentsForJudge.map((team) => (
                        <Grid item xs={12} sm={6} md={4} key={`final-${team.teamId}`}>
                          <ScheduleCard
                            teamId={team.teamId}
                            teamName={team.name}
                            room={team.room}
                            time={team.timeslot}
                            disabled={finalRoundScoredTeamIds.has(team.teamId)}
                            onButtonClick={(card) => openFor({ ...card, round: "final" })}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  )}
                </Section>
              </>
            )}
          </>
        )}

        {!canViewAssignments && !canManageSchedule && (
          <Typography variant="body2">You do not have assigned judging duties.</Typography>
        )}
      </Stack>

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

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Layout>
  );
}

export default Assignments;
