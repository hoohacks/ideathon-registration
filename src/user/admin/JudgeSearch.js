import { onValue, ref, update } from "firebase/database";
import { database } from "../../firebase";

import React, { useEffect, useMemo, useState } from "react";

import ProgressBar from "react-bootstrap/ProgressBar";
import Button from "react-bootstrap/Button";
import "bootstrap/dist/css/bootstrap.min.css";
import Form from "react-bootstrap/Form";
import Layout from "../Layout";

function CheckedInProgressBar({ percent }) {
  return (
    <div style={{ marginBottom: "40px", marginInline: "10%" }}>
      <ProgressBar now={percent} label={percent + "%"} variant="danger"></ProgressBar>
    </div>
  );
}

function Badge({ children, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        marginRight: "8px",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "13px",
        backgroundColor: color,
        color: "white",
      }}
    >
      {children}
    </span>
  );
}

function JudgeSearch() {
  const [Query, setQuery] = useState("");
  const [checkedInFilter, setCheckedInFilter] = useState("");
  const [roundOneFilter, setRoundOneFilter] = useState("");

  const handleMetricsClick = () => {
    window.location.href =
      "https://hoohacks.github.io/ideathon-registration/#/registeredAtDisplay";
  };

  const [judges, setJudges] = useState([]);
  const [showProgressBar, setShowProgressBar] = useState(false);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, "/judges/"), (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setJudges([]);
        return;
      }
      setJudges(Object.entries(data).map(([id, details]) => ({ id, ...details })));
    });

    return () => unsubscribe();
  }, []);

  const checkedInCount = judges.filter((judge) => judge.checkedIn).length;
  // the scheduler only assigns judges carrying this flag, so the count is worth
  // showing before anyone hits Generate Schedule
  const roundOneCount = judges.filter((judge) => judge.isRound1Judge === true).length;
  const percentCheckedIn = judges.length
    ? ((checkedInCount / judges.length) * 100).toFixed(2)
    : "0.00";

  function toggleProgressBar(e) {
    setShowProgressBar(e.target.checked);
  }

  const handleCheckIn = (judge) => {
    // a targeted update rather than read-modify-write, so this cannot clobber a
    // check-in happening at the scanner at the same moment
    update(ref(database, `/judges/${judge.id}`), { checkedIn: !judge.checkedIn });
  };

  const handleToggleRoundOne = (judge) => {
    update(ref(database, `/judges/${judge.id}`), {
      isRound1Judge: judge.isRound1Judge !== true,
    });
  };

  const filteredJudges = useMemo(() => {
    const needle = Query.toLowerCase();
    return judges.filter((judge) => {
      const fullName = `${judge.firstName ?? ""} ${judge.lastName ?? ""}`.trim();
      const matchesQuery =
        fullName.toLowerCase().includes(needle) ||
        (judge.email ?? "").toLowerCase().includes(needle);

      const matchesCheckedIn =
        checkedInFilter === "" ||
        String(Boolean(judge.checkedIn)) === checkedInFilter;

      const matchesRoundOne =
        roundOneFilter === "" ||
        String(judge.isRound1Judge === true) === roundOneFilter;

      return matchesQuery && matchesCheckedIn && matchesRoundOne;
    });
  }, [judges, Query, checkedInFilter, roundOneFilter]);

  return (
    <Layout>
      <button
        onClick={handleMetricsClick}
        style={{
          position: "fixed",
          border: "1px solid white",
          top: "20px",
          left: "20px",
          borderRadius: "12px",
          backgroundColor: "#34a0a4",
          color: "white",
          zIndex: 1000,
        }}
      >
        Metrics
      </button>

      <h1 style={{ fontSize: "48px", textAlign: "center" }}>Admin Judge Dashboard</h1>
      <p style={{ fontSize: "24px", textAlign: "center" }}>
        Total Signed-Up: {judges.length} | Checked In: {checkedInCount} | Percentage:{" "}
        {percentCheckedIn}%
        <Form.Check
          inline
          style={{ fontSize: "15px", marginLeft: "30px" }}
          type="switch"
          id="custom-switch"
          label="Show Progress Bar"
          onChange={(e) => toggleProgressBar(e)}
        />
      </p>
      <p style={{ fontSize: "18px", textAlign: "center" }}>
        {roundOneCount} judge{roundOneCount === 1 ? "" : "s"} marked for the first
        round. Only these are given team assignments when a schedule is generated.
      </p>
      {showProgressBar && <CheckedInProgressBar percent={percentCheckedIn} />}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px", gap: "10px" }}>
        <input
          type="text"
          placeholder="Search by name or email"
          value={Query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "260px", height: "40px", fontSize: "16px" }}
        />
        <select
          value={checkedInFilter}
          onChange={(e) => setCheckedInFilter(e.target.value)}
          style={{ width: "200px", height: "40px", fontSize: "16px" }}
        >
          <option value="">All judges</option>
          <option value="true">Checked in</option>
          <option value="false">Not checked in</option>
        </select>
        <select
          value={roundOneFilter}
          onChange={(e) => setRoundOneFilter(e.target.value)}
          style={{ width: "220px", height: "40px", fontSize: "16px" }}
        >
          <option value="">Any round</option>
          <option value="true">First round judges</option>
          <option value="false">Not first round</option>
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {filteredJudges.map((judge) => {
          const fullName =
            `${judge.firstName ?? ""} ${judge.lastName ?? ""}`.trim() || "Unnamed Judge";
          const roles = [
            judge.wantsToJudge && "Judging",
            judge.wantsToMentor && "Mentoring",
          ]
            .filter(Boolean)
            .join(" & ");

          const isCheckedIn = Boolean(judge.checkedIn);
          const isRoundOne = judge.isRound1Judge === true;
          const assignments = Array.isArray(judge.teamAssignments)
            ? judge.teamAssignments.filter((a) => a && typeof a === "object")
            : [];

          return (
            <div
              style={{
                border: isCheckedIn ? "1px solid #34a0a4" : "1px solid #ccc",
                borderRadius: "15px",
                padding: "30px",
              }}
              key={judge.id}
            >
              <p className="label" style={{ fontSize: "24px", fontWeight: "bold" }}>
                {fullName}
              </p>

              <div style={{ marginBottom: "10px" }}>
                {isRoundOne && <Badge color="#2563eb">First round judge</Badge>}
                {judge.isHooHacksMember && <Badge color="#7c3aed">HooHacks member</Badge>}
                {isCheckedIn && <Badge color="#34a0a4">Checked in</Badge>}
              </div>

              <p>
                {judge.email} ({judge.id})
              </p>
              <p>{roles}</p>
              {judge.withCompany ? (
                <p>
                  <span>{judge.company}</span>
                </p>
              ) : null}
              {assignments.length ? (
                <p>
                  <span>
                    Judging Assignments:{" "}
                    {assignments
                      .map((a) => `${a.teamName} (${a.time}, ${a.room})`)
                      .join(", ")}
                  </span>
                </p>
              ) : null}
              {Array.isArray(judge.timeslots) && judge.timeslots.length ? (
                <p>
                  <span>Mentorship Timeslots: {judge.timeslots.join(", ")}</span>
                </p>
              ) : null}
              <div style={{ display: "flex", gap: "10px" }}>
                <Button
                  onClick={() => handleCheckIn(judge)}
                  style={{
                    borderRadius: "12px",
                    backgroundColor: isCheckedIn ? "#34a0a4" : "#2a6f97",
                    color: "white",
                  }}
                >
                  {isCheckedIn ? "Checked In" : "Check In"}
                </Button>
                <Button
                  onClick={() => handleToggleRoundOne(judge)}
                  style={{
                    borderRadius: "12px",
                    backgroundColor: isRoundOne ? "#2563eb" : "#64748b",
                    color: "white",
                  }}
                >
                  {isRoundOne ? "First Round Judge" : "Mark First Round"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

export default JudgeSearch;
