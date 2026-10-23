/**
 * An address that matches no route.
 *
 * Signed out, the registration form is the front door. Signed in, it is the
 * wrong place to be sent: a judge who mistyped a URL mid-event was shown the
 * student sign-up form.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

vi.mock("./firebase", () => ({ database: {}, storage: {}, auth: { currentUser: null } }));
const { AuthContext, UnknownAddress } = await import("./App");

const at = (auth) =>
  render(
    <AuthContext.Provider value={{ loadingAuth: false, ...auth }}>
      <MemoryRouter initialEntries={["/user/judge"]}>
        <Routes>
          <Route path="/" element={<p>registration</p>} />
          <Route path="/user/home" element={<p>home</p>} />
          <Route path="*" element={<UnknownAddress />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

test("signed in, it goes home", () => {
  at({ userCredential: { user: { uid: "j1" } } });
  expect(screen.getByText("home")).toBeInTheDocument();
});

test("signed out, it goes to the front door", () => {
  at({ userCredential: null });
  expect(screen.getByText("registration")).toBeInTheDocument();
});

test("while sign-in is still settling, it waits rather than guessing", () => {
  at({ userCredential: null, loadingAuth: true });
  expect(screen.queryByText("registration")).not.toBeInTheDocument();
  expect(screen.queryByText("home")).not.toBeInTheDocument();
});
