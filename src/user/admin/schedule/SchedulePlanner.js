import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Stack, Tab, Tabs, Typography } from "@mui/material";
import Layout from "../../Layout.js";
import SchedulePreview from "./SchedulePreview.js";
import FinalRoundPlanner from "./FinalRoundPlanner.js";

/**
 * Both rounds are planned here.
 *
 * The first round has had a planner since the schedule preview landed; the
 * final round was a modal that derived everything at the moment of the write.
 * They are the same job — look at it, correct it, then publish — so they are
 * the same page, and one nav entry covers both.
 *
 * `?round=final` so the Judging page can link straight to the half it means.
 */
export default function SchedulePlanner() {
  const [params, setParams] = useSearchParams();
  const [round, setRound] = useState(params.get("round") === "final" ? "final" : "first");

  function pick(next) {
    setRound(next);
    // keep the URL honest, so a reload and a shared link land in the same place
    setParams(next === "final" ? { round: "final" } : {}, { replace: true });
  }

  // The first-round preview brings its own Layout and heading; the final round
  // planner is a section, so it gets them here.
  if (round === "first") {
    return (
      <>
        <RoundTabs round={round} onPick={pick} />
        <SchedulePreview />
      </>
    );
  }

  return (
    <>
      <RoundTabs round={round} onPick={pick} />
      <Layout maxWidth="lg">
        <Stack spacing={2}>
          <Typography variant="h1">Final round</Typography>
          <FinalRoundPlanner />
        </Stack>
      </Layout>
    </>
  );
}

function RoundTabs({ round, onPick }) {
  return (
    <Layout maxWidth="lg" sx={{ pb: 0 }}>
      <Tabs value={round} onChange={(_, next) => onPick(next)}>
        <Tab value="first" label="First round" />
        <Tab value="final" label="Final round" />
      </Tabs>
    </Layout>
  );
}
