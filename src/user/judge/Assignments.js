import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  FormControlLabel,
  Grid,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import Layout from "../Layout";
import ScheduleCard from "./ScheduleCard";
import { getJudgeSchedule, readScheduleMeta } from "./getJudgeSchedule";
import { getPersonalSchedule, getFinalRoundSchedule } from "./getPersonalSchedule";
import ScoreSubmission from "./ScoreSubmission";
import { useAuth } from "../../App";
import { hasRole } from "../../roles";
import {
  findTeamIdByName,
  submitScore,
  getMyScoredTeamIds,
  getMyFinalRoundScoredTeamIds,
  FIRST_ROUND,
  FINAL_ROUND,
} from "./getTeamInfo";
import { activateFinalRound, deactivateFinalRound, subscribeToFinalRoundActive } from "./finalRoundService";
import { useJudgingSync } from "./useJudgingSync";
import { clearDraft } from "./scoreDraft";

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
  const [onlyCheckedIn, setOnlyCheckedIn] = useState(false);
  const [generateResult, setGenerateResult] = useState(null);
  const [scheduleMeta, setScheduleMeta] = useState(null);
  const [personalAssignments, setPersonalAssignments] = useState([]);
  const [finalAssignments, setFinalAssignments] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  // scored teams are tracked by database id, never by name -- team names are
  // not unique and would collide
  const [scoredTeamIds, setScoredTeamIds] = useState(() => new Set());
  const [finalRoundScoredTeamIds, setFinalRoundScoredTeamIds] = useState(() => new Set());
  const [finalRoundActive, setFinalRoundActive] = useState(false);
  const [finalRoundLoading, setFinalRoundLoading] = useState(true);
  const [togglingFinalRound, setTogglingFinalRound] = useState(false);
  const [finalRoundError, setFinalRoundError] = useState(null);

  const { userTypes, userCredential } = useAuth();
  const currentUserId = userCredential?.user?.uid;
  const canManageSchedule = hasRole(userTypes, "admin");
  const canViewAssignments = hasRole(userTypes, "judge");

  const { online, pendingCount, pendingTeamIds, syncing, retry } = useJudgingSync(
    canViewAssignments ? currentUserId : null
  );

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
      // silently showing "no assignments yet" for what is really a failed read
      // sends a judge to find an organiser for a problem that is not theirs
      setToast({
        severity: "error",
        message: "Could not load your assignments. Check your connection and reload.",
      });
    } finally {
      setLoadingAssignments(false);
    }
  }, [canViewAssignments]);

  useEffect(() => {
    loadPersonalSchedule();
  }, [loadPersonalSchedule]);

  useEffect(() => {
    if (!canManageSchedule) return;
    readScheduleMeta().then(setScheduleMeta).catch(() => setScheduleMeta(null));
  }, [canManageSchedule, generateResult]);

  async function handleGenerateClick() {
    if (generating) return;

    // The confirmation used to hang off React state, so a reload cleared it and
    // the next click silently replaced every assignment in the event. The
    // marker is read back from the database instead, which survives the reload.
    const existing = scheduleMeta ?? (await readScheduleMeta().catch(() => null));
    if (existing?.generatedAt) {
      const when = new Date(existing.generatedAt).toLocaleString();
      const scored = existing.scoredTeams ?? 0;
      const warning = scored
        ? `\n\n${scored} team(s) already have scores. Those scores are NOT deleted, but they will belong to judges who are no longer assigned, and they keep counting toward the averages.`
        : "";
      const confirmed = window.confirm(
        `A schedule was generated on ${when}. Regenerating replaces every judge and team assignment.${warning}\n\nContinue?`
      );
      if (!confirmed) return;
    }

    try {
      setGenerating(true);
      setGenerateResult(null);
      const result = await getJudgeSchedule({ onlyCheckedIn });
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
      const result = await activateFinalRound();
      setGenerateResult(null);
      if (result.warnings?.length) {
        setToast({ severity: "warning", message: result.warnings.join(" ") });
      }
    } catch (err) {
      console.error("Failed to activate final round:", err);
      setFinalRoundError(err.message || "Failed to activate final round.");
    } finally {
      setTogglingFinalRound(false);
    }
  }

  async function handleDeactivateFinalRound() {
    const confirmed = window.confirm(
      "Deactivate final round judging? Assignments are withdrawn from every judge and the standings are archived."
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

      const round = selected?.round === FINAL_ROUND ? FINAL_ROUND : FIRST_ROUND;
      const isFinalRound = round === FINAL_ROUND;

      // schedules written before assignments carried an id fall back to a name
      // lookup, which is why duplicate team names are worth avoiding
      const teamId = selected?.teamId ?? (await findTeamIdByName(teamName));
      if (!teamId) {
        setToast({ severity: "error", message: `Could not find "${teamName}" in the database.` });
        return;
      }

      const result = await submitScore({ round, teamId, teamName, score: scores });

      // the outbox owns the card either way now, so the draft has done its job
      if (currentUserId) clearDraft({ round, teamId, judgeUid: currentUserId });

      const record = isFinalRound ? setFinalRoundScoredTeamIds : setScoredTeamIds;
      if (result.status === "saved") {
        record((prev) => new Set(prev).add(teamId));
        setToast({ severity: "success", message: `Score submitted for ${teamName}.` });
      } else {
        setToast({
          severity: "warning",
          message: `No connection. ${teamName}'s score is saved on this device and will send itself when you are back online.`,
        });
      }
      closeModal();
    } catch (e) {
      console.error(e);
      setToast({ severity: "error", message: `Could not submit: ${e.message}` });
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeToFinalRoundActive((state) => {
      setFinalRoundActive(Boolean(state?.active));
      setFinalRoundLoading(false);
      setFinalRoundError(state?.error ?? null);
    });
    return () => unsubscribe();
  }, []);

  // The judge's finalists come from their own record. Deriving them in the
  // browser from /finalRound only worked because every judge could read the
  // standings -- team names and average scores -- before they were announced.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!finalRoundActive || !canViewAssignments) {
        if (!cancelled) {
          setFinalAssignments([]);
          setFinalRoundScoredTeamIds(new Set());
        }
        return;
      }
      try {
        const teams = await getFinalRoundSchedule();
        if (cancelled) return;
        setFinalAssignments(teams);
        const scored = await getMyFinalRoundScoredTeamIds(teams.map((t) => t.id));
        if (!cancelled) setFinalRoundScoredTeamIds(scored);
      } catch (err) {
        console.error("Error fetching final round assignments:", err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [finalRoundActive, canViewAssignments]);

  const stats = generateResult?.ok ? generateResult.stats : null;

  const remaining = useMemo(
    () =>
      personalAssignments.filter(
        (a) => !scoredTeamIds.has(a.id) && !pendingTeamIds.has(a.id)
      ).length,
    [personalAssignments, scoredTeamIds, pendingTeamIds]
  );

  const draftTarget = useMemo(() => {
    if (!selected?.teamId || !currentUserId) return null;
    return {
      round: selected.round === FINAL_ROUND ? FINAL_ROUND : FIRST_ROUND,
      teamId: selected.teamId,
      judgeUid: currentUserId,
    };
  }, [selected, currentUserId]);

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

        {canViewAssignments && (pendingCount > 0 || !online) && (
          <Alert
            severity={pendingCount > 0 ? "warning" : "info"}
            action={
              pendingCount > 0 ? (
                <Button color="inherit" size="small" onClick={retry} disabled={syncing}>
                  {syncing ? "Sending…" : "Retry now"}
                </Button>
              ) : undefined
            }
          >
            {pendingCount > 0
              ? `${pendingCount} score${pendingCount === 1 ? "" : "s"} saved on this device and waiting to send. Keep this page open.`
              : "You are offline. Scores will be saved on this device until the connection is back."}
          </Alert>
        )}

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
                  : scheduleMeta?.generatedAt
                  ? "Regenerate schedule"
                  : "Generate schedule"}
              </Button>
              {finalRoundActive ? (
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

            <FormControlLabel
              sx={{ mt: 1 }}
              control={
                <Checkbox
                  size="small"
                  checked={onlyCheckedIn}
                  onChange={(e) => setOnlyCheckedIn(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  Only schedule judges who have checked in
                </Typography>
              }
            />

            {(generateResult || finalRoundError || finalRoundActive || scheduleMeta) && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                {finalRoundActive && <Alert severity="info">Final round is active.</Alert>}
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
                {!generateResult && scheduleMeta?.generatedAt && (
                  <Typography variant="body2">
                    Schedule generated {new Date(scheduleMeta.generatedAt).toLocaleString()}.
                    Use Judging progress to move a single judge rather than regenerating.
                  </Typography>
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
                        onButtonClick={(card) => openFor({ ...card, round: FIRST_ROUND })}
                        disabled={scoredTeamIds.has(assignment.id)}
                        pending={pendingTeamIds.has(assignment.id)}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
            </Section>

            {finalRoundActive && (
              <>
                <Divider />
                <Section title="Final round">
                  {finalAssignments.length === 0 ? (
                    <Card sx={{ p: 3 }}>
                      <Typography variant="body2" align="center">
                        No final round assignments for you.
                      </Typography>
                    </Card>
                  ) : (
                    <Grid container spacing={2}>
                      {finalAssignments.map((team) => (
                        <Grid item xs={12} sm={6} md={4} key={`final-${team.id}`}>
                          <ScheduleCard
                            teamId={team.id}
                            teamName={team.teamName}
                            room={team.room}
                            time={team.timeslot ?? team.time}
                            disabled={finalRoundScoredTeamIds.has(team.id)}
                            pending={pendingTeamIds.has(team.id)}
                            onButtonClick={(card) => openFor({ ...card, round: FINAL_ROUND })}
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
          draftTarget={draftTarget}
          isOverwrite={
            selected.round === FINAL_ROUND
              ? finalRoundScoredTeamIds.has(selected.teamId)
              : scoredTeamIds.has(selected.teamId)
          }
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
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
