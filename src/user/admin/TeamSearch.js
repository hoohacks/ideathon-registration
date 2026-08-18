import { onValue, ref, get } from "firebase/database";
import { database } from "../../firebase";
import {
  calculateAverageScore,
  countFundableVotes,
  scoreCard,
  SCORE_FIELDS,
  SCORE_MAX_TOTAL,
} from "../judge/finalRoundService";

import React, { useEffect, useMemo, useState } from "react";

import ProgressBar from "react-bootstrap/ProgressBar";
import "bootstrap/dist/css/bootstrap.min.css";
import Form from "react-bootstrap/Form";
import Layout from "../Layout";

function SubmissionProgressBar({ percent }) {
  return (
    <div style={{ marginBottom: "40px", marginInline: "10%" }}>
      <ProgressBar now={percent} label={percent + "%"} variant="danger"></ProgressBar>
    </div>
  );
}

function ScoreBreakdown({ title, scores }) {
  const judgeIds = Object.keys(scores ?? {});
  if (!judgeIds.length) return null;

  const average = calculateAverageScore(scores);
  const fundable = countFundableVotes(scores);

  return (
    <div style={{ marginTop: "20px" }}>
      <h3 style={{ fontSize: "20px" }}>{title}</h3>
      <p>
        <strong>Aggregate:</strong>{" "}
        {average === null ? "not scored" : `${average.toFixed(1)} / ${SCORE_MAX_TOTAL}`}{" "}
        ({judgeIds.length} judge{judgeIds.length === 1 ? "" : "s"}, {fundable} voted fundable)
      </p>
      {judgeIds.map((judgeId) => {
        const scoreObj = scores[judgeId];
        const card = scoreCard(scoreObj);
        return (
          <div key={judgeId} style={{ marginBottom: "10px" }}>
            <p style={{ marginBottom: "4px" }}>
              <strong>Judge {judgeId}</strong>
              {card === null ? "" : ` — ${card.toFixed(1)} / ${SCORE_MAX_TOTAL}`}
            </p>
            <ul style={{ marginBottom: "4px" }}>
              {Object.entries(SCORE_FIELDS).map(([criterion, max]) => (
                <li key={criterion}>
                  {criterion.replace(/_/g, " ")}: {scoreObj?.[criterion] ?? "—"} / {max}
                </li>
              ))}
              <li>fundable: {scoreObj?.fundable ? "yes" : "no"}</li>
            </ul>
            {scoreObj?.notes ? (
              <p>
                <strong>Comments:</strong> {scoreObj.notes}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TeamSearch() {
  const [Query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");

  const [Data, setData] = useState({});
  const [submittedCount, setSubmittedCount] = useState(0);

  const [showProgressBar, setShowProgressBar] = useState(false);
  const teamCount = Object.keys(Data).length;
  const percentSubmitted = teamCount
    ? ((submittedCount / teamCount) * 100).toFixed(2)
    : "0.00";

  function toggleProgressBar(e) {
    setShowProgressBar(e.target.checked);
  }

  useEffect(() => {
    const unsubscribe = onValue(ref(database, "/teams/"), async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setData({});
        setSubmittedCount(0);
        return;
      }

      let submitted = 0;
      const resolved = {};

      for (const key in data) {
        const team = { ...data[key] };
        if (team.submitted) submitted += 1;

        if (Array.isArray(team.members)) {
          team.memberNames = await Promise.all(
            team.members.map(async (uid) => {
              const userSnapshot = await get(ref(database, `competitors/${uid}`));
              if (userSnapshot.exists()) {
                const userInfo = userSnapshot.val();
                return `${userInfo.firstName} ${userInfo.lastName}`;
              }
              return "Unknown User";
            })
          );
        } else {
          team.memberNames = [];
        }

        resolved[key] = team;
      }

      setSubmittedCount(submitted);
      setData(resolved);
    });

    return () => unsubscribe();
  }, []);

  const visibleTeams = useMemo(() => {
    const needle = Query.toLowerCase();
    const keys = Object.keys(Data).filter((key) => {
      const team = Data[key];
      return (
        (team?.name ?? "").toLowerCase().includes(needle) ||
        (team?.submission?.ideaName ?? "").toLowerCase().includes(needle)
      );
    });

    const scoreOf = (key) => calculateAverageScore(Data[key]?.scores) ?? -1;

    return keys.sort((a, b) => {
      if (sortBy === "score") return scoreOf(b) - scoreOf(a);
      if (sortBy === "finalScore") {
        const f = (key) => calculateAverageScore(Data[key]?.scores_final_round) ?? -1;
        return f(b) - f(a);
      }
      return (Data[a]?.name ?? "").localeCompare(Data[b]?.name ?? "");
    });
  }, [Data, Query, sortBy]);

  return (
    <Layout>
      <h1 style={{ fontSize: "48px", textAlign: "center" }}>Admin Team Dashboard</h1>
      <p style={{ fontSize: "24px", textAlign: "center" }}>
        Total: {teamCount} | Submitted: {submittedCount} | Percentage: {percentSubmitted}%
        <Form.Check
          inline
          style={{ fontSize: "15px", marginLeft: "30px" }}
          type="switch"
          id="custom-switch"
          label="Show Progress Bar"
          onChange={(e) => toggleProgressBar(e)}
        />
      </p>
      {showProgressBar && <SubmissionProgressBar percent={percentSubmitted} />}
      <h2 style={{ fontSize: "24px", textAlign: "center" }}>Teams and Scores</h2>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Search by team or idea name"
          value={Query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "300px", height: "40px", fontSize: "16px" }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ width: "300px", height: "40px", fontSize: "16px" }}
        >
          <option value="name">Sort by name</option>
          <option value="score">Sort by first round score</option>
          <option value="finalScore">Sort by final round score</option>
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {visibleTeams.map((key) => {
          const teamData = Data[key];

          return (
            <div
              style={{ border: "1px solid #ccc", borderRadius: "15px", padding: "30px" }}
              key={key}
            >
              <p className="label" style={{ fontSize: "24px", fontWeight: "bold" }}>
                {teamData.name}
                {teamData.submitted ? " ✅" : " ❌"}
              </p>

              <p>ID: {key}</p>

              <strong>Members: {teamData.memberNames?.length ?? 0}</strong>
              <ul>
                {teamData.memberNames?.map((memberName, idx) => (
                  <li key={idx}>{memberName}</li>
                ))}
              </ul>

              {teamData.schedule ? (
                <p>
                  <strong>Pitch:</strong> {teamData.schedule.time} in{" "}
                  {teamData.schedule.room} (batch {teamData.schedule.batch}) ·{" "}
                  {teamData.schedule.judges?.length ?? 0} judges
                </p>
              ) : null}

              {teamData.submitted && teamData.submission && (
                <>
                  <p>
                    <strong>Idea Name:</strong> {teamData.submission.ideaName}
                  </p>
                  <p>
                    <strong>Problem Statement:</strong> {teamData.submission.problemStatement}
                  </p>
                  <p>
                    <strong>Target Industry:</strong> {teamData.submission.targetIndustry}
                  </p>
                  {teamData.submission.pitchDeckURL ? (
                    <a
                      href={teamData.submission.pitchDeckURL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Pitch Deck
                    </a>
                  ) : null}
                </>
              )}

              <ScoreBreakdown title="First Round Scores" scores={teamData.scores} />
              <ScoreBreakdown
                title="Final Round Scores"
                scores={teamData.scores_final_round}
              />
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

export default TeamSearch;
