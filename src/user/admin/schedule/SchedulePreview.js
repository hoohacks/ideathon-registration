import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ref, get } from "firebase/database";
import {
  Alert, Box, Button, Card, Checkbox, FormControlLabel, Snackbar, Stack, Typography,
} from "@mui/material";
import { database } from "../../../firebase.js";
import Layout from "../../Layout.js";
import { ConfirmDialog } from "../adminUi.js";
import PlanGrid from "./PlanGrid.js";
import TeamSlotDrawer from "./TeamSlotDrawer.js";
import DriftPanel from "./DriftPanel.js";
import { planSchedule } from "../../judge/planSchedule.js";
import { subscribeDraft, saveDraft, clearDraft } from "../../judge/draftStore.js";
import { applyEdit, undoEdit } from "../../judge/applyEdit.js";
import { computeStats } from "../../judge/computeStats.js";
import { publishPlan } from "../../judge/publishPlan.js";
import { readScheduleMeta } from "../../judge/scheduleConfig.js";

/**
 * Preview, hand-edit and publish a judging schedule.
 *
 * "Generate Schedule" used to read the event, build a plan and replace every
 * assignment in it, in one press. The organizer's first sight of the plan
 * was the plan already being live. This page puts a reviewable, editable
 * step in front of that: `planSchedule` builds a plan with no writes,
 * `draftStore` holds it where a closed laptop lid cannot lose it, and this
 * component owns everything an organizer can do to it before `publishPlan`
 * makes it real.
 *
 * It owns the draft subscription and every action -- `PlanGrid`,
 * `TeamSlotDrawer` and `DriftPanel` are presentational. The one edit
 * pipeline, `handleEdit`, is passed down to the drawer as `onEdit`: it runs
 * an op through `applyEdit` and, on success, `saveDraft`s the result. A
 * `saveDraft` refusal is surfaced two ways: this page's Snackbar carries who
 * moved it, since the live subscription is about to replace `plan` with
 * their version anyway, and the return value tells the drawer its own save
 * failed too -- a failed save must never be reported back as success.
 */

const REBUILD_LABEL = "Rebuild the plan";

function formatAge(createdAt) {
  if (!createdAt) return null;
  const ms = Date.now() - createdAt;
  if (!Number.isFinite(ms) || ms < 0) return new Date(createdAt).toLocaleString();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(createdAt).toLocaleString();
}

export default function SchedulePreview() {
  const navigate = useNavigate();

  // undefined: subscription has not delivered its first value yet.
  // null: delivered, and there is no draft. object: the draft.
  const [plan, setPlan] = useState(undefined);

  const [onlyCheckedIn, setOnlyCheckedIn] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState(null);

  const [openTeamId, setOpenTeamId] = useState(null);
  const [toast, setToast] = useState(null);

  const [drift, setDrift] = useState(null);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [confirmRebuildOpen, setConfirmRebuildOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [scheduleMeta, setScheduleMeta] = useState(null);
  // Distinct from "scheduleMeta is null because there is no schedule yet" --
  // a transient read failure must not be read as "nothing to protect", or the
  // typed-confirmation gate silently disappears in exactly the case (a
  // schedule really does exist) it exists to guard.
  const [scheduleMetaFailed, setScheduleMetaFailed] = useState(false);
  const [eventName, setEventName] = useState(null);

  useEffect(() => subscribeDraft(setPlan), []);

  const stats = plan ? computeStats(plan) : null;

  // ---- editing a team's slot or judges ----

  async function handleEdit(op) {
    const result = applyEdit(plan, op);
    if (!result.ok) return result;

    const saved = await saveDraft(result.plan);
    if (!saved.ok) {
      // The live subscription has already replaced `plan` with whoever
      // else's version won, so this also goes to the page Snackbar -- but the
      // drawer still needs to know its own save failed, or it clears its
      // error and the edit reads as having worked.
      setToast({ severity: "error", message: saved.error });
      return { ok: false, error: saved.error };
    }
    return { ok: true };
  }

  async function handleUndo() {
    const result = undoEdit(plan);
    if (!result.ok) return;
    const saved = await saveDraft(result.plan);
    if (!saved.ok) setToast({ severity: "error", message: saved.error });
  }

  // ---- building the first plan ----

  async function handleBuild() {
    setBuilding(true);
    const result = await planSchedule({ onlyCheckedIn });
    setBuilding(false);
    setBuildResult(result);
    if (!result.ok) return;

    const saved = await saveDraft({ ...result.plan, edits: [], version: 0 });
    if (!saved.ok) setToast({ severity: "error", message: saved.error });
  }

  // ---- drift repair ----

  function sameRepair(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  async function handleRepair(repair) {
    if (repair.type === "dropTeam") {
      const next = {
        ...plan,
        assignments: { ...plan.assignments },
        // Also drop it from basis.teamIds, or computeStats.unscheduledTeamIds
        // (which derives from that list) reports the just-withdrawn team as
        // unscheduled the instant this saves -- putting a **Place** button in
        // front of the organizer for a team that no longer exists.
        basis: {
          ...plan.basis,
          teamIds: (plan.basis?.teamIds ?? []).filter((id) => id !== repair.teamId),
        },
      };
      delete next.assignments[repair.teamId];
      const saved = await saveDraft(next);
      if (!saved.ok) { setToast({ severity: "error", message: saved.error }); return; }
    } else {
      const result = applyEdit(plan, repair);
      if (!result.ok) { setToast({ severity: "error", message: result.error }); return; }
      const saved = await saveDraft(result.plan);
      if (!saved.ok) { setToast({ severity: "error", message: saved.error }); return; }
    }

    // The repaired item is stale now -- drop it from the panel rather than
    // waiting for a fresh Publish attempt to recompute the whole thing, so
    // an organizer working through a list of several does not have to
    // re-trigger drift detection after every single one.
    setDrift((current) => {
      if (!current) return current;
      const blocking = current.blocking.filter((item) => !sameRepair(item.repair, repair));
      if (!blocking.length && !current.advisory.length) return null;
      return { ...current, blocking };
    });
  }

  function requestRebuild() {
    setConfirmRebuildOpen(true);
  }

  async function confirmRebuild() {
    setConfirmRebuildOpen(false);
    setRebuilding(true);
    const result = await planSchedule({ onlyCheckedIn: plan?.onlyCheckedIn ?? onlyCheckedIn });
    setRebuilding(false);
    if (!result.ok) { setToast({ severity: "error", message: result.error }); return; }

    const saved = await saveDraft({ ...result.plan, edits: [], version: plan.version });
    if (!saved.ok) { setToast({ severity: "error", message: saved.error }); return; }
    setDrift(null);
    setBuildResult(result);
  }

  // ---- discard ----

  async function confirmDiscard() {
    setConfirmDiscardOpen(false);
    const result = await clearDraft();
    if (!result.ok) setToast({ severity: "error", message: result.error });
  }

  // ---- publish ----

  async function openPublishConfirm() {
    // readScheduleMeta does not catch its own read failures -- a genuine
    // `null` ("read succeeded, no schedule exists") has to stay distinguishable
    // from a rejected read, so this catches it here rather than folding both
    // into the same `.catch(() => null)`, which would fail open.
    let meta = null;
    let failed = false;
    try {
      meta = await readScheduleMeta();
    } catch (error) {
      failed = true;
    }
    const eventNameSnap = await get(ref(database, "config/eventName")).catch(() => null);

    setScheduleMeta(meta);
    setScheduleMetaFailed(failed);
    setEventName(eventNameSnap && eventNameSnap.exists() ? eventNameSnap.val() : null);
    setConfirmPublishOpen(true);
  }

  async function confirmPublish() {
    setConfirmPublishOpen(false);
    setPublishing(true);
    const result = await publishPlan(plan);
    setPublishing(false);

    if (result.ok) {
      setToast({ severity: "success", message: "Schedule published." });
      navigate("/user/admin/judging");
      return;
    }
    if (result.drift) { setDrift(result.drift); return; }
    setToast({ severity: "error", message: result.error });
  }

  const hasExistingSchedule = Boolean(scheduleMeta?.generatedAt);
  // Fail closed: an organizer typing an extra confirmation after a blip costs
  // nothing; publishing without it, when a schedule might really exist behind
  // the failed read, is the one outcome this gate exists to prevent.
  const requiresConfirmPhrase = hasExistingSchedule || scheduleMetaFailed;
  const publishConsequences = [
    "A restore point will be taken first.",
    "Every judge and team assignment in the event is replaced.",
  ];
  if ((scheduleMeta?.scoredTeams ?? 0) > 0) {
    publishConsequences.push(
      `${scheduleMeta.scoredTeams} team(s) already have scores. They are not deleted, but ` +
        "they will belong to judges who are no longer assigned."
    );
  }
  if (scheduleMetaFailed) {
    publishConsequences.push(
      "The existing schedule could not be checked, so this is treated as a replacement."
    );
  }

  // ---- render ----

  if (plan === undefined) {
    return (
      <Layout maxWidth="lg">
        <Typography variant="body2">Loading the schedule preview…</Typography>
      </Layout>
    );
  }

  if (plan === null) {
    return (
      <Layout maxWidth="lg">
        <Stack spacing={3}>
          <Typography variant="h1">Schedule preview</Typography>

          <Card sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography variant="body2">
                No draft yet. Build a plan to see it before it goes live -- nothing is
                written until you publish it.
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={onlyCheckedIn}
                    onChange={(event) => setOnlyCheckedIn(event.target.checked)}
                  />
                }
                label="Only schedule judges who have checked in"
              />

              <Button
                variant="contained"
                onClick={handleBuild}
                disabled={building}
                sx={{ alignSelf: "flex-start" }}
              >
                {building ? "Building…" : "Build a plan"}
              </Button>

              {buildResult && !buildResult.ok && (
                <Alert severity="error">{buildResult.error}</Alert>
              )}
              {buildResult?.warnings?.map((warning) => (
                <Alert severity="warning" key={warning}>{warning}</Alert>
              ))}
              {buildResult?.advice?.map((line) => (
                <Alert severity="info" key={line}>{line}</Alert>
              ))}
            </Stack>
          </Card>
        </Stack>
      </Layout>
    );
  }

  const lastEdit = plan.edits?.[plan.edits.length - 1];

  return (
    <Layout maxWidth="lg">
      <Stack spacing={2} sx={{ pb: 10 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={1}
        >
          <Typography variant="body2" color="text.secondary">
            {formatAge(plan.createdAt) ? `Started ${formatAge(plan.createdAt)}` : "Draft"}
            {plan.createdByName ? ` by ${plan.createdByName}` : ""}
          </Typography>
          <Button size="small" color="error" onClick={() => setConfirmDiscardOpen(true)}>
            Discard draft
          </Button>
        </Stack>

        {buildResult?.ok && (
          <Stack spacing={1}>
            {buildResult.warnings?.map((warning) => (
              <Alert severity="warning" key={warning} onClose={() => setBuildResult(null)}>
                {warning}
              </Alert>
            ))}
            {buildResult.advice?.map((line) => (
              <Alert severity="info" key={line} onClose={() => setBuildResult(null)}>
                {line}
              </Alert>
            ))}
          </Stack>
        )}

        {drift && <DriftPanel drift={drift} onRepair={handleRepair} onRebuild={requestRebuild} />}

        <PlanGrid plan={plan} stats={stats} onOpenTeam={setOpenTeamId} />
      </Stack>

      <TeamSlotDrawer
        open={Boolean(openTeamId)}
        plan={plan}
        teamId={openTeamId}
        onEdit={handleEdit}
        onClose={() => setOpenTeamId(null)}
      />

      <Box
        sx={{
          position: "sticky",
          bottom: 0,
          bgcolor: "background.paper",
          borderTop: 1,
          borderColor: "divider",
          p: 2,
          mt: 2,
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={2} alignItems="baseline" flexWrap="wrap">
            <Typography variant="body2">
              {stats.teams} teams · {stats.judges} judges
            </Typography>
            <Typography variant="body2">
              {plan.edits?.length ?? 0} edit{(plan.edits?.length ?? 0) === 1 ? "" : "s"}
            </Typography>
            <Button size="small" disabled={!plan.edits?.length} onClick={handleUndo}>
              {lastEdit ? `Undo "${lastEdit.summary}"` : "Undo"}
            </Button>
          </Stack>
          <Button variant="contained" onClick={openPublishConfirm} disabled={publishing || rebuilding}>
            {publishing ? "Publishing…" : "Publish schedule"}
          </Button>
        </Stack>
      </Box>

      <ConfirmDialog
        open={confirmPublishOpen}
        title="Publish this schedule?"
        consequences={publishConsequences}
        typeToConfirm={requiresConfirmPhrase ? (eventName || String(stats.teams)) : undefined}
        confirmLabel="Publish"
        onConfirm={confirmPublish}
        onCancel={() => setConfirmPublishOpen(false)}
      />

      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Discard this draft?"
        consequences={[
          "The plan and every hand edit on it are discarded.",
          "This does not touch anything already published.",
        ]}
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
        onCancel={() => setConfirmDiscardOpen(false)}
      />

      <ConfirmDialog
        open={confirmRebuildOpen}
        title={REBUILD_LABEL}
        consequences={[
          `Your ${plan.edits?.length ?? 0} hand edit${(plan.edits?.length ?? 0) === 1 ? "" : "s"} ` +
            "are discarded.",
        ]}
        confirmLabel="Rebuild"
        onConfirm={confirmRebuild}
        onCancel={() => setConfirmRebuildOpen(false)}
      />

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
