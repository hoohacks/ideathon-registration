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
 * visible.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
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

jest.mock("../snapshots", () => ({
  JUDGING_PATHS: ["teams", "judges", "scores", "finalRound", "config/scheduleMeta"],
  subscribeToSnapshots: (callback) => {
    callback([mockPoint]);
    return () => {};
  },
  captureSnapshot: jest.fn(async () => ({ ok: true })),
  restoreSnapshot: jest.fn(async () => ({ ok: true, restored: 3 })),
}));

function renderSection() {
  return render(
    <ThemeProvider theme={theme}>
      <RestorePointsSection onResult={jest.fn()} />
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

    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  test("does not render another page inside itself", () => {
    renderSection();

    // the metrics page, if it leaks back in, announces itself with this heading
    expect(screen.queryByRole("heading", { name: "Registration Metrics" })).toBeNull();

    // and a nested Layout would put a second navigation landmark on the page
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);
  });
});
