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

function Search() {
  const [Query, setQuery] = useState("");
  const [checkedInFilter, setCheckedInFilter] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState("");

  const [competitors, setCompetitors] = useState([]);
  const [showProgressBar, setShowProgressBar] = useState(false);

  const checkedInCount = competitors.filter((person) => person.checkedIn).length;
  const percentCheckedIn = competitors.length
    ? ((checkedInCount / competitors.length) * 100).toFixed(2)
    : "0.00";

  function toggleProgressBar(e) {
    setShowProgressBar(e.target.checked);
  }

  useEffect(() => {
    const unsubscribe = onValue(ref(database, "/competitors/"), (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setCompetitors([]);
        return;
      }
      setCompetitors(
        Object.entries(data).map(([id, details]) => ({ id, ...details }))
      );
    });

    return () => unsubscribe();
  }, []);

  const handleCheckIn = (person) => {
    // a targeted update rather than writing the whole record back, which would
    // clobber anything the competitor changed since this page loaded
    update(ref(database, `/competitors/${person.id}`), {
      checkedIn: !person.checkedIn,
    });
  };

  const dietaryOptions = useMemo(() => {
    const values = new Set(
      competitors.map((person) => person.dietaryRestriction).filter(Boolean)
    );
    return [...values].sort();
  }, [competitors]);

  const filteredResults = useMemo(() => {
    const needle = Query.toLowerCase();
    return competitors.filter((person) => {
      const fullName = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();
      const matchesQuery =
        fullName.toLowerCase().includes(needle) ||
        (person.email ?? "").toLowerCase().includes(needle);

      const matchesCheckedIn =
        checkedInFilter === "" ||
        String(Boolean(person.checkedIn)) === checkedInFilter;

      const matchesDietary =
        dietaryFilter === "" || person.dietaryRestriction === dietaryFilter;

      return matchesQuery && matchesCheckedIn && matchesDietary;
    });
  }, [competitors, Query, checkedInFilter, dietaryFilter]);

  return (
    <Layout>
      <h1 style={{ fontSize: "48px", textAlign: "center" }}>Admin Dashboard</h1>
      <p style={{ fontSize: "24px", textAlign: "center" }}>
        Total Signed-Up: {competitors.length} | Checked In: {checkedInCount} |
        Percentage: {percentCheckedIn}%
        <Form.Check
          inline
          style={{ fontSize: "15px", marginLeft: "30px" }}
          type="switch"
          id="custom-switch"
          label="Show Progress Bar"
          onChange={(e) => toggleProgressBar(e)}
        />
      </p>
      {showProgressBar && <CheckedInProgressBar percent={percentCheckedIn} />}
      <h2 style={{ fontSize: "24px", textAlign: "center" }}>Name and Emails</h2>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: "20px",
          gap: "10px",
        }}
      >
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
          <option value="">All competitors</option>
          <option value="true">Checked in</option>
          <option value="false">Not checked in</option>
        </select>
        <select
          value={dietaryFilter}
          onChange={(e) => setDietaryFilter(e.target.value)}
          style={{ width: "220px", height: "40px", fontSize: "16px" }}
        >
          <option value="">Any dietary restriction</option>
          {dietaryOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {filteredResults.map((person) => {
          const fullName =
            `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() ||
            "Unnamed Competitor";
          const isCheckedIn = Boolean(person.checkedIn);

          return (
            <div
              key={person.id}
              style={{
                borderRadius: "15px",
                border: isCheckedIn ? "1px solid #34a0a4" : "1px solid #ccc",
                padding: "30px",
              }}
            >
              <p className="label" style={{ fontSize: "24px", fontWeight: "bold" }}>
                {fullName}
              </p>

              <p>{person.dietaryRestriction}</p>
              <p>{person.email}</p>
              {person.resume ? (
                <p>
                  <a href={person.resume} target="_blank" rel="noopener noreferrer">
                    {fullName} resume
                  </a>
                </p>
              ) : null}
              <Button
                onClick={() => handleCheckIn(person)}
                style={{
                  borderRadius: "12px",
                  backgroundColor: isCheckedIn ? "#34a0a4" : "#2a6f97",
                  color: "white",
                }}
              >
                {isCheckedIn ? "Checked In" : "Check In"}
              </Button>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}

export default Search;
