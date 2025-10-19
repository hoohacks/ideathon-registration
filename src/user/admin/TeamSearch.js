import { onValue, ref, get, set } from "firebase/database";
import { database } from "../../firebase";
import { calculateAverageScore } from "../judge/finalRoundService";

import React, { useEffect, useState } from "react";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import { styled } from "@mui/material/styles";

import ProgressBar from "react-bootstrap/ProgressBar";
import Button from "react-bootstrap/Button";
import "bootstrap/dist/css/bootstrap.min.css";
import Form from "react-bootstrap/Form";
import Layout from "../Layout";

function SubmissionProgressBar({ percent }) {
  return (
    <div style={{ marginBottom: "40px", marginInline: "10%" }}>
      <ProgressBar
        now={percent}
        label={percent + "%"}
        variant="danger"
      ></ProgressBar>
    </div>
  );
}

function TeamSearch() {
  const [Query, setQuery] = useState("");
  const [dietaryRestriction, setDietaryRestriction] = useState([]);
  const [selectedDietaryRestriction, setSelectedDietaryRestriction] =
    useState("");

  const [Data, setData] = useState({});
  const [submittedCount, setSubmittedCount] = useState(0);

  //progress bar
  const [showProgressBar, setShowProgressBar] = useState(false);
  const percentSubmitted = (
    (submittedCount / Object.keys(Data).length) *
    100
  ).toFixed(2);

  // <button onclick="https://hoohacks.github.io/ideathon-registration/#/registeredAtDisplay">Metrics</button>

  function toggleProgressBar(e) {
    setShowProgressBar(e.target.checked);
  }

  useEffect(() => {
    onValue(ref(database, "/teams/"), async (snapshot) => {
      const data = snapshot.val();

      // Get team members' names

      let s = 0;
      for (const key in data) {
        if (data[key].submitted) {
          s += 1;
        }

        if (!data[key].members)
          continue;
        data[key].members = await Promise.all(
          data[key].members.map(async (uid) => {
            const userRef = ref(database, `competitors/${uid}`);
            const userSnapshot = await get(userRef);
            if (userSnapshot.exists()) {
              const userInfo = userSnapshot.val();
              return `${userInfo.firstName} ${userInfo.lastName}`;
            }
            return "Unknown User";
          })
        );
      }
      setSubmittedCount(s);

      // Set the newData object as the state
      setData(data);
    });
  }, []);

  const filteredResults = Object.keys(Data).filter((key) => {
    const teamData = Data[key];
    const {
      name,
      members: memberIds,
      submission,
      submitted
    } = teamData;

    const matchesQuery =
      name.toLowerCase().includes(Query.toLowerCase()) ||
      submission?.ideaName?.toLowerCase().includes(Query.toLowerCase());

    return matchesQuery;
  });

  return (
    <Layout>
      <h1 style={{ fontSize: "48px", textAlign: "center" }}>
        Admin Team Dashboard
      </h1>
      <p style={{ fontSize: "24px", textAlign: "center" }}>
        Total: {Object.keys(Data).length} | Submitted:{" "}
        {submittedCount} | Percentage: {percentSubmitted}%
        <Form.Check
          inline
          style={{ fontSize: "15px", marginLeft: "30px" }}
          type="switch"
          id="custom-switch"
          label="Show Progress Bar"
          onChange={(e) => toggleProgressBar(e)}
        />
      </p>
      {showProgressBar && (
        <SubmissionProgressBar
          percent={percentSubmitted}
        ></SubmissionProgressBar>
      )}
      <h2 style={{ fontSize: "24px", textAlign: "center" }}>Name and Emails</h2>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "20px",
        }}
      >
        {/* Search input */}
        <input
          type="text"
          placeholder="Search by name or email"
          value={Query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "300px",
            height: "40px",
            fontSize: "16px",
          }}
        />
        <select
          value={selectedDietaryRestriction}
          onChange={(e) => setSelectedDietaryRestriction(e.target.value)}
          style={{
            width: "300px",
            height: "40px",
            fontSize: "16px",
          }}
        >
          <option value="true">Checked In</option>
          <option value="false">Not Checked In</option>
          <option value="">No Filter</option>
          <option value="">No Filter</option>
        </select>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // gridTemplateColumns: "repeat(5, minmax(250px, 1fr))",
          gap: "20px",
        }}
      >
        {filteredResults.map((key, index) => {
          const teamData = Data[key]; // Access the data associated with the key(hash)

          return (
            <div style={{ border: "1px solid #ccc", borderRadius: "15px", padding: "30px" }} key={key}>
              <p
                className="label"
                style={{ fontSize: "24px", fontWeight: "bold" }}
              >
                {teamData.name}{teamData.submitted ? " ✅" : " ❌"}
              </p>

              <p>ID: {key}</p>

              <strong>Members: {teamData.members ? teamData.members.length : 0}</strong>
              <ul>
                {teamData.members && teamData.members.map((memberName, idx) => (
                  <li key={idx}>{memberName}</li>
                ))}
              </ul>

              {teamData.submitted && teamData.submission && (
                <>
                  <p>
                    <strong>Idea Name:</strong> {teamData.submission.ideaName}
                  </p>
                  <p>
                    <strong>Problem Statement:</strong>{" "}
                    {teamData.submission.problemStatement}
                  </p>
                  <p>
                    <strong>Target Industry:</strong>{" "}
                    {teamData.submission.targetIndustry}
                  </p>
                  <a href={teamData.submission.pitchDeckURL} target="_blank" rel="noopener noreferrer">Pitch Deck</a>
                </>
              )}

              {teamData.scores && (
                <div style={{ marginTop: "20px" }}>
                  <h3>Scores:</h3>
                  <p>Aggregate Score: {calculateAverageScore(teamData.scores)}</p>
                  {Object.entries(teamData.scores).map(
                    ([judgeId, scoreObj]) => (
                      <div key={judgeId} style={{ marginBottom: "10px" }}>
                        <p>
                          <strong>Judge ID:</strong> {judgeId}
                        </p>
                        <p>
                          <strong>Score:</strong>
                          <ul>
                            {Object.entries(scoreObj).map(
                              ([criterion, score]) => (
                                ["impact", "innovation", "pitch_quality", "problem"].includes(criterion) && (
                                  <li key={criterion}>
                                    {criterion}: {score}
                                  </li>
                                ))
                            )}
                          </ul>
                        </p>
                        <p>
                          <strong>Comments:</strong> {scoreObj.notes}
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

export default TeamSearch;
