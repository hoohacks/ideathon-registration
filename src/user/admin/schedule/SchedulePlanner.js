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
 *
 * **One `Layout` per page.** `Layout` is the whole page frame: a 100vh box with
 * the site nav and the footer in it. Rendering the tabs in their own Layout
 * above the preview stacked two of those, so the first screenful was a nav, a
 * tab strip, a viewport-tall empty container and a footer — the planner sat one
 * full screen below the fold and the page read as blank. jsdom has no viewport,
 * so only a browser showed it. The tabs are therefore handed to whichever view
 * is showing and rendered inside its frame.
 */
export default function SchedulePlanner() {
  const [params, setParams] = useSearchParams();
  const [round, setRound] = useState(params.get("round") === "final" ? "final" : "first");

  function pick(next) {
    setRound(next);
    // keep the URL honest, so a reload and a shared link land in the same place
    setParams(next === "final" ? { round: "final" } : {}, { replace: true });
  }

  const tabs = (
    <Tabs value={round} onChange={(_, next) => pick(next)} sx={{ mb: 2 }}>
      <Tab value="first" label="First round" />
      <Tab value="final" label="Final round" />
    </Tabs>
  );

  // the first-round preview owns its own frame, so the tabs go into it
  if (round === "first") return <SchedulePreview header={tabs} />;

  return (
    <Layout maxWidth="lg">
      {tabs}
      <Stack spacing={2}>
        <Typography variant="h1">Final round</Typography>
        <FinalRoundPlanner />
      </Stack>
    </Layout>
  );
}
