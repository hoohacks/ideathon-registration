/**
 * FinalRoundPreview, with planFinalRound and publishFinalRound mocked
 * directly.
 *
 * The component's only real dependency is finalRoundService.js -- it never
 * touches Firebase or AuthContext itself, and neither does ConfirmDialog
 * (from adminUi.js). So mocking that one module is enough: no Firebase
 * stubs, no AuthContext, no MemoryRouter, unlike src/pages.smoke.test.js and
 * schedulePreview.test.js, which need the full stub set because the pages
 * they render pull in Layout, roles.js and routed links.
 *
 * What matters most here is not that the dialog renders, but that an
 * organizer's checkbox choices actually reach `publishFinalRound` as the
 * `finalists` argument. If the checkbox state never left the component,
 * every other test could stay green while the published cut silently
 * ignored whatever the organizer chose.
 */
import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../../../theme";
import FinalRoundPreview from "./FinalRoundPreview";

jest.mock("../../judge/finalRoundService.js", () => ({
  planFinalRound: jest.fn(),
  publishFinalRound: jest.fn(),
}));

const { planFinalRound, publishFinalRound } = require("../../judge/finalRoundService.js");

// The dialog fires its planFinalRound() fetch from a useEffect on mount, and
// does not await it there -- a normal fire-and-forget pattern, but the mock
// promise's resolution then lands in a plain microtask that `render()`'s own
// (synchronous) act() wrapping has already closed by the time it settles.
// Wrapping the render in an async act() flushes that pending microtask
// before any test proceeds, so the resulting state update is not reported as
// happening outside of act().
async function renderDialog(props = {}) {
  let utils;
  await act(async () => {
    utils = render(
      <ThemeProvider theme={theme}>
        <FinalRoundPreview open onClose={jest.fn()} onActivated={jest.fn()} {...props} />
      </ThemeProvider>
    );
  });
  return utils;
}

/** Five ranked teams, cut at the default limit of 4. */
function makePlan(overrides = {}) {
  const ranked = [
    { teamId: "t0", name: "Aurora", averageScore: 38, fundableVotes: 2, judgeCount: 2 },
    { teamId: "t1", name: "Borealis", averageScore: 36, fundableVotes: 1, judgeCount: 2 },
    { teamId: "t2", name: "Cascade", averageScore: 34, fundableVotes: 1, judgeCount: 2 },
    { teamId: "t3", name: "Delta", averageScore: 30, fundableVotes: 0, judgeCount: 2 },
    { teamId: "t4", name: "Ember", averageScore: 28, fundableVotes: 0, judgeCount: 2 },
  ];
  return {
    ok: true,
    error: null,
    finalists: ranked.slice(0, 4),
    ranked,
    warnings: [],
    basis: { cardCounts: { t0: 2, t1: 2, t2: 2, t3: 2, t4: 2 } },
    ...overrides,
  };
}

beforeEach(() => {
  planFinalRound.mockReset();
  publishFinalRound.mockReset();
  planFinalRound.mockResolvedValue(makePlan());
  publishFinalRound.mockResolvedValue({ ok: true, warnings: [], snapshotId: "snap-1" });
});

// ---- 1. The cut line ---------------------------------------------------

test("the ranked table shows the cut line after the limit'th row", async () => {
  await renderDialog();
  await screen.findByText("Aurora");

  // header row + 4 finalists + the divider row + 1 team below the cut
  expect(screen.getAllByRole("row")).toHaveLength(7);

  // Ember (rank 5, first team out) sits right after the divider
  const emberRow = screen.getByText("Ember").closest("tr");
  expect(emberRow.previousElementSibling.textContent.trim()).toBe("");

  // Delta (rank 4, last team in) does not -- no divider between finalists
  const deltaRow = screen.getByText("Delta").closest("tr");
  expect(deltaRow.previousElementSibling.textContent.trim()).not.toBe("");
});

// ---- 2. Unchecking a finalist excludes it ------------------------------

test("unchecking a finalist excludes it from the published finalist set", async () => {
  const onActivated = jest.fn();
  await renderDialog({ onActivated });
  await screen.findByText("Borealis");

  const borealisRow = screen.getByText("Borealis").closest("tr");
  userEvent.click(within(borealisRow).getByRole("checkbox"));

  userEvent.click(screen.getByRole("button", { name: "Activate final round" }));
  userEvent.click(await screen.findByRole("button", { name: "Activate" }));

  expect(publishFinalRound).toHaveBeenCalledTimes(1);
  const { finalists } = publishFinalRound.mock.calls[0][0];
  expect(finalists.map((t) => t.teamId)).toEqual(["t0", "t2", "t3"]);

  // let confirmActivate's async tail (onActivated/onClose, after the
  // publishFinalRound promise resolves) land before the test ends, rather
  // than leaking a pending state update into whichever test runs next
  await waitFor(() => expect(onActivated).toHaveBeenCalled());
});

// ---- 3. Checking a team below the cut includes it ----------------------

test("checking a team below the cut includes it in the published finalist set", async () => {
  const onActivated = jest.fn();
  await renderDialog({ onActivated });
  await screen.findByText("Ember");

  const emberRow = screen.getByText("Ember").closest("tr");
  userEvent.click(within(emberRow).getByRole("checkbox"));

  userEvent.click(screen.getByRole("button", { name: "Activate final round" }));
  userEvent.click(await screen.findByRole("button", { name: "Activate" }));

  expect(publishFinalRound).toHaveBeenCalledTimes(1);
  const { finalists } = publishFinalRound.mock.calls[0][0];
  expect(finalists.map((t) => t.teamId)).toEqual(["t0", "t1", "t2", "t3", "t4"]);

  await waitFor(() => expect(onActivated).toHaveBeenCalled());
});

// ---- 4. staleScores offers Re-rank -------------------------------------

test("a staleScores result renders the message and Re-rank calls planFinalRound again", async () => {
  publishFinalRound.mockResolvedValue({
    ok: false,
    staleScores:
      "Ember has been scored since this ranking was computed. Re-rank before publishing.",
    warnings: [],
  });
  await renderDialog();
  await screen.findByText("Aurora");

  userEvent.click(screen.getByRole("button", { name: "Activate final round" }));
  userEvent.click(await screen.findByRole("button", { name: "Activate" }));

  expect(await screen.findByText(/Ember has been scored since/i)).toBeInTheDocument();
  expect(planFinalRound).toHaveBeenCalledTimes(1);

  // MUI's modal manager marks the dialog `aria-hidden` while the nested
  // ConfirmDialog is open, and only lifts it once that modal's exit
  // transition fires an `onExited` -- which real timers eventually deliver,
  // but jsdom does not fire on its own within a test. `getByRole` respects
  // that (still-stale) `aria-hidden` and would not find the button here even
  // though it is genuinely on screen and clickable; `getByText` does not
  // filter on it, so it finds the same button `getByRole` will find once the
  // real DOM has caught up.
  // Re-rank's click handler calls planFinalRound() again without awaiting it
  // itself (same fire-and-forget pattern as the mount effect -- see
  // renderDialog above), so the click is wrapped in an async act() here too,
  // to flush that second call's pending microtask before the test ends.
  await act(async () => {
    userEvent.click(screen.getByText("Re-rank").closest("button"));
  });
  expect(planFinalRound).toHaveBeenCalledTimes(2);
  await screen.findByText("Aurora");
});

// ---- 5. planFinalRound's warnings are shown ----------------------------

test("warnings from planFinalRound are displayed", async () => {
  planFinalRound.mockResolvedValue(
    makePlan({ warnings: ["Borealis reached the final on fewer than 2 judges."] })
  );
  await renderDialog();
  expect(await screen.findByText(/fewer than 2 judges/i)).toBeInTheDocument();
});
