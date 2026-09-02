/**
 * The restore point list, rendered with a point in it.
 *
 * The page smoke test renders the whole control panel against a stubbed
 * database that returns nothing, so `points` is always empty there and the row
 * body never runs. That blind spot is how this section shipped rendering an
 * entire copy of the Registration Metrics page inside every row: the timestamp
 * was `<RegisteredAtDisplay value={point.at} />`, and RegisteredAtDisplay is
 * the metrics *page*, which takes no props, renders its own Layout and header,
 * and opens its own /competitors subscription.
 *
 * These render with a point present, which is the only state where that is
 * visible. The Preview dialog gets its own coverage below: it is what stands
 * between "Restore" and actually overwriting live data, so what it shows --
 * and what it falls back to when the judges read fails -- is worth pinning.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../../../theme";
import RestorePointsSection from "./RestorePointsSection";

const mockPoint = {
  id: "snap-1",
  label: "Before the schedule was generated",
  at: Date.UTC(2026, 7, 30, 16, 1, 14),
  byName: "admin YtLiqYzF",
  bytes: 8192,
  paths: ["teams", "judges", "scores"],
};

/** A snapshot with one added team, one lost score card. */
function mockPreviewResult() {
  return {
    ok: true,
    entries: [
      { path: "teams", value: JSON.stringify({ t1: { name: "Aurora" } }) },
      { path: "scores", value: JSON.stringify({ first: { t1: { j0: { total: 30 } } } }) },
    ],
    live: {
      teams: { t1: { name: "Aurora" }, t2: { name: "New Team" } },
      scores: { first: { t1: { j0: { total: 30 }, j1: { total: 28 } } } },
    },
  };
}

jest.mock("../snapshots", () => ({
  JUDGING_PATHS: ["teams", "judges", "scores", "finalRound", "config/scheduleMeta"],
  subscribeToSnapshots: (callback) => {
    callback([mockPoint]);
    return () => {};
  },
  captureSnapshot: jest.fn(async () => ({ ok: true })),
  restoreSnapshot: jest.fn(async () => ({ ok: true, restored: 3 })),
  previewSnapshot: jest.fn(async () => mockPreviewResult()),
  readJudgeNames: jest.fn(async () => ({ ok: true, names: { j1: "Judge Smith" } })),
}));

const { restoreSnapshot, previewSnapshot, readJudgeNames } = require("../snapshots");

/**
 * create-react-app sets `resetMocks: true`, which strips the implementation
 * off every jest.fn before each test -- so an implementation passed to
 * jest.fn() at declaration is gone by the time the first test runs. Every
 * implementation has to be re-established here.
 */
beforeEach(() => {
  restoreSnapshot.mockReset();
  restoreSnapshot.mockResolvedValue({ ok: true, restored: 3 });
  previewSnapshot.mockReset();
  previewSnapshot.mockResolvedValue(mockPreviewResult());
  readJudgeNames.mockReset();
  readJudgeNames.mockResolvedValue({ ok: true, names: { j1: "Judge Smith" } });
});

function renderSection(onResult = jest.fn()) {
  return render(
    <ThemeProvider theme={theme}>
      <RestorePointsSection onResult={onResult} />
    </ThemeProvider>
  );
}

describe("a restore point row", () => {
  test("shows when it was taken, who by, and how big", () => {
    renderSection();

    expect(screen.getByText("Before the schedule was generated")).toBeInTheDocument();

    // the date matters as well as the time -- a restore point can be older than today
    const caption = screen.getByText(/admin YtLiqYzF/);
    expect(caption).toHaveTextContent(new Date(mockPoint.at).toLocaleString());
    expect(caption).toHaveTextContent("8 KB");

    // restoring happens from inside the preview dialog now, not straight off the row
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  test("does not render another page inside itself", () => {
    renderSection();

    // the metrics page, if it leaks back in, announces itself with this heading
    expect(screen.queryByRole("heading", { name: "Registration Metrics" })).toBeNull();

    // and a nested Layout would put a second navigation landmark on the page
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);
  });
});

describe("the preview dialog", () => {
  test("names the team and judge behind a lost score", async () => {
    renderSection();
    userEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(previewSnapshot).toHaveBeenCalledWith("snap-1");
    expect(
      await screen.findByText("1 score card will be destroyed: Aurora by Judge Smith")
    ).toBeInTheDocument();

    // the per-path counts are shown too -- scoped to the diff line's <strong>,
    // since "teams" also appears in the row's path Chip
    const teamsLine = screen.getByText("teams", { selector: "strong" }).closest("p");
    expect(teamsLine).toHaveTextContent("teams — 0 added, 0 changed, 1 removed");
  });

  test("falls back to the judge's uid when the one-shot judges read fails", async () => {
    readJudgeNames.mockResolvedValue({ ok: false, error: "no permission", names: {} });
    renderSection();
    userEvent.click(screen.getByRole("button", { name: "Preview" }));

    // the dialog still opens and still names the team -- only the judge falls back
    expect(
      await screen.findByText("1 score card will be destroyed: Aurora by j1")
    ).toBeInTheDocument();
  });

  test("restoring requires typing the restore point's label, then calls restoreSnapshot", async () => {
    const onResult = jest.fn();
    renderSection(onResult);
    userEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText(/score card will be destroyed/);

    userEvent.click(screen.getByRole("button", { name: "Restore…" }));

    const confirmButton = await screen.findByRole("button", { name: "Restore" });
    const typedField = screen.getByLabelText('Type "Before the schedule was generated" to confirm');

    userEvent.type(typedField, "not it");
    expect(confirmButton).toBeDisabled();

    userEvent.clear(typedField);
    userEvent.type(typedField, "Before the schedule was generated");
    expect(confirmButton).toBeEnabled();

    userEvent.click(confirmButton);

    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(restoreSnapshot).toHaveBeenCalledWith("snap-1");
    expect(onResult).toHaveBeenCalledWith(
      { ok: true, restored: 3 },
      expect.stringContaining("Restored 3 path(s)")
    );
  });
});
