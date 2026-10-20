import { act, screen } from "@testing-library/react";
import { renderPage } from "../../testing/renderPage";

vi.mock("../../firebase", () => ({ database: {}, storage: {}, auth: { currentUser: { uid: "c1" } } }));
vi.mock("firebase/database", async () => (await import("../../testing/fakeDatabase")).module);
vi.mock("react-zxing", () => ({ useZxing: () => ({ ref: { current: null } }) }));
vi.mock("react-chartjs-2", () => ({ Line: () => null, Bar: () => null }));
const db = await import("../../testing/fakeDatabase");
const { default: PitchCard } = await import("./PitchCard");
const { default: Home } = await import("../Home");

const competitor = {
  userTypes: ["competitor"],
  userData: { firstName: "Alex", teamId: "t1" },
};

describe("the pitch card", () => {
  beforeEach(() => db.reset());

  test("nothing published is nothing on screen", () => {
    const { container } = renderPage(<PitchCard schedule={null} finalSlot={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("the first round reads as a time and a room", () => {
    renderPage(<PitchCard schedule={{ time: "5:00 PM", room: "Rice 350" }} />);
    expect(screen.getByText(/You pitch at/)).toHaveTextContent("You pitch at 5:00 PM in Rice 350.");
  });

  test("a final round slot reads as a place in the running order, not a time", () => {
    renderPage(<PitchCard finalSlot={{ timeslot: "Slot 2", room: "Rice 011" }} />);
    expect(screen.getByText(/You pitch/)).toHaveTextContent("You pitch 2nd in Rice 011.");
  });

  test("a final round slot typed as a time keeps the time", () => {
    renderPage(<PitchCard finalSlot={{ timeslot: "6:10 PM", room: "Rice 011" }} />);
    expect(screen.getByText(/You pitch/)).toHaveTextContent("You pitch at 6:10 PM in Rice 011.");
  });

  test("a final round start time set by an organizer shows on the label, live", async () => {
    db.reset({ config: { finalRoundTime: "7:00 PM" } });
    renderPage(<PitchCard finalSlot={{ timeslot: "Slot 2", room: "Rice 011" }} />);
    expect(await screen.findByText("Final round, starting at 7:00 PM")).toBeInTheDocument();

    await act(async () => db.setData("config/finalRoundTime", "7:30 PM"));
    expect(screen.getByText("Final round, starting at 7:30 PM")).toBeInTheDocument();
  });

  test("with both rounds, each line is labelled", () => {
    renderPage(
      <PitchCard
        schedule={{ time: "5:00 PM", room: "Rice 350" }}
        finalSlot={{ timeslot: "Slot 11", room: "Rice 011" }}
      />
    );
    expect(screen.getByText("First round")).toBeInTheDocument();
    expect(screen.getByText("Final round")).toBeInTheDocument();
    expect(screen.getByText("11th")).toBeInTheDocument();
  });
});

describe("on a competitor's home page", () => {
  test("their team's pitch times show, and follow the database live", async () => {
    db.reset({ teams: { t1: { name: "Lantern", schedule: { time: "5:00 PM", room: "Rice 350" } } } });
    renderPage(<Home />, { auth: competitor });

    expect(await screen.findByText(/You pitch at/)).toHaveTextContent("You pitch at 5:00 PM in Rice 350.");
    expect(screen.queryByText("Final round")).not.toBeInTheDocument();

    await act(async () => db.setData("teams/t1/finalSlot", { timeslot: "Slot 2", room: "Rice 011" }));
    expect(screen.getByText("Final round")).toBeInTheDocument();
    expect(screen.getByText("2nd")).toBeInTheDocument();
  });

  test("before anything is published there is no card", async () => {
    db.reset({ teams: { t1: { name: "Lantern" } } });
    renderPage(<Home />, { auth: competitor });
    await screen.findByText("Hi, Alex");
    expect(screen.queryByText(/You pitch/)).not.toBeInTheDocument();
  });

  test("a judge with no team gets no card", async () => {
    db.reset({ teams: { t1: { schedule: { time: "5:00 PM", room: "Rice 350" } } } });
    renderPage(<Home />, { auth: { userTypes: ["judge"], userData: { firstName: "Jo", teamId: "t1" } } });
    await screen.findByText("Hi, Jo");
    expect(screen.queryByText(/You pitch/)).not.toBeInTheDocument();
  });
});
