import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import Profile from "./Profile";
import { AuthContext } from "../App";

vi.mock("../App", async () => ({ AuthContext: (await import("react")).createContext(null) }));
vi.mock("./Layout", () => ({ default: ({ children }) => <main>{children}</main> }));
vi.mock("../firebase", () => ({ auth: {}, database: {} }));
vi.mock("../Registration", () => ({ default: ({ recoveryUser, onComplete }) => (
  <button onClick={onComplete}>Student profile for {recoveryUser.uid}</button>
) }));
vi.mock("../JudgeRegistration", () => ({ default: ({ recoveryUser, onComplete }) => (
  <button onClick={onComplete}>Judge profile for {recoveryUser.uid}</button>
) }));

function renderProfile(extra = {}) {
  const refreshUserData = vi.fn(async () => {});
  render(<MemoryRouter><AuthContext.Provider value={{
    userData: null, userTypes: [], userCredential: { user: { uid: "orphan" } },
    refreshUserData, ...extra,
  }}><Profile /></AuthContext.Provider></MemoryRouter>);
  return refreshUserData;
}

test.each([
  ["Complete student registration", "Student profile for orphan"],
  ["Complete judge or mentor registration", "Judge profile for orphan"],
])("missing profile offers %s", async (choice, form) => {
  const user = userEvent.setup();
  const refresh = renderProfile();
  await user.click(screen.getByRole("button", { name: choice }));
  await user.click(screen.getByRole("button", { name: form }));
  expect(refresh).toHaveBeenCalled();
});

test("a failed profile lookup offers retry instead of registration", async () => {
  const user = userEvent.setup();
  const refresh = renderProfile({ profileLoadError: true });
  expect(screen.queryByRole("button", { name: "Complete student registration" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(refresh).toHaveBeenCalled();
});
