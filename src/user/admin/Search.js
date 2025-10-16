import { onValue, ref, get, set } from "firebase/database";
import { database } from "../../firebase";

import React, { useEffect, useState } from "react";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import { styled } from "@mui/material/styles";

import ProgressBar from "react-bootstrap/ProgressBar";
import Button from "react-bootstrap/Button";
import "bootstrap/dist/css/bootstrap.min.css";
import Form from "react-bootstrap/Form";
import Layout from "../Layout";

function CheckedInProgressBar({ percent }) {
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

function Search() {
  const [Query, setQuery] = useState("");
  const [dietaryRestriction, setDietaryRestriction] = useState([]);
  const [selectedDietaryRestriction, setSelectedDietaryRestriction] =
    useState("");
  // varun stuff

  const handleMetricsClick = () => {
    window.location.href =
      "https://hoohacks.github.io/ideathon-registration/#/registeredAtDisplay";
  };

  const [Data, setData] = useState({});
  const [checkedInCount, setCheckedInCount] = useState(0);

  //progress bar
  const [showProgressBar, setShowProgressBar] = useState(false);
  const percentCheckedIn = (
    (checkedInCount / Object.keys(Data).length) *
    100
  ).toFixed(2);

  // <button onclick="https://hoohacks.github.io/ideathon-registration/#/registeredAtDisplay">Metrics</button>

  function toggleProgressBar(e) {
    setShowProgressBar(e.target.checked);
  }

  useEffect(() => {
    onValue(ref(database, "/competitors/"), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const newData = {};
        let newCheckedInCount = 0;

        for (const key in data) {
          if (data.hasOwnProperty(key)) {
            const entry = data[key];

            const {
              firstName,
              lastName,
              email,
              dietaryRestriction,
              resume,
              checkedIn,
            } = entry;
            const fullName = `${firstName} ${lastName}`;

            if (key != null) {
              if (!newData[key]) {
                newData[key] = [];
                newData[key].push({
                  fullName,
                  email,
                  dietaryRestriction,
                  resume,
                  checkedIn,
                });

                if (checkedIn) {
                  newCheckedInCount++;
                }
              }
            }
          }
        }

        // Set the newData object as the state
        setData(newData);
        setCheckedInCount(newCheckedInCount);
      }
    });
  }, []);

  const handleCheckIn = (key) => {
    // Get a reference to the participant's check-in status in Firebase
    const participantRef = ref(database, "/competitors/" + key);

    // Use the set function to update the check-in status
    get(participantRef).then((snapshot) => {
      const personData = snapshot.val() || false;
      if (personData == false) {
        return;
      }

      personData.checkedIn = !personData.checkedIn;

      set(participantRef, personData);
    });
  };

  const filteredResults = Object.keys(Data).filter((key) => {
    const personData = Data[key];
    const fullName = personData[0].fullName.toString();
    const email = personData[0].email; // Get email from the person's data

    const matchesQuery =
      fullName.toLowerCase().includes(Query.toLowerCase()) ||
      (email && email.toLowerCase().includes(Query.toLowerCase()));

    return matchesQuery;
  });

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
      <h1 className="label" style={{ fontSize: "48px", textAlign: "center" }}>
        Ideathon Admin Dashboard
      </h1>
      <p style={{ fontSize: "24px", textAlign: "center" }}>
        Total Signed-Up: {Object.keys(Data).length} | Checked In:{" "}
        {checkedInCount} | Percentage: {percentCheckedIn}%
        <Form.Check // prettier-ignore
          inline
          style={{ fontSize: "15px", marginLeft: "30px" }}
          type="switch"
          id="custom-switch"
          label="Show Progress Bar"
          onChange={(e) => toggleProgressBar(e)}
        />
      </p>
      {showProgressBar && (
        <CheckedInProgressBar
          percent={percentCheckedIn}
        ></CheckedInProgressBar>
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
          <option value="vegetarian">Vegetarian</option>
          <option value="gluten-free">Gluten-free</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {filteredResults.map((key, index) => {
          const personData = Data[key]; // Access the data associated with the key(hash)

          const dietaryRestrictionValue = personData[0].dietaryRestriction; // Get dietaryRestriction from the person's data
          const fullName = personData[0].fullName.toString();

          const isCheckedIn = personData[0].checkedIn;
          const checkedInString = String(personData[0].checkedIn);

          if (
            !selectedDietaryRestriction ||
            (dietaryRestrictionValue &&
              dietaryRestrictionValue.includes(selectedDietaryRestriction)) ||
            (checkedInString &&
              checkedInString.includes(selectedDietaryRestriction))
          ) {
            return (
              <div>
                <div
                  key={index}
                  style={{
                    borderRadius: "15px",
                    border: isCheckedIn ? "1px solid #34a0a4" : "1px solid #ccc",
                    padding: "30px",
                  }}

                //onMouseEnter={(e) => { e.target.style.transform = "scale(1.05)"; }} // Enlarge on hover
                //onMouseLeave={(e) => { e.target.style.transform = "scale(1)"; }} // Return to the original size
                >
                  <p
                    className="label"
                    style={{ fontSize: "24px", fontWeight: "bold" }}
                  >
                    {fullName}
                  </p>

                  <p>{dietaryRestrictionValue}</p>
                  <p>{personData[0].email}</p>
                  {personData.map((data, dataIndex) => (
                    <div key={dataIndex}>
                      {data.resume ? (
                        <p>
                          <a
                            href={data.resume}
                            target="_blank"
                            rel="noopener noreferrer"
                          // style={{ color: "#89c2d9" }}
                          >
                            {fullName} resume
                          </a>
                        </p>
                      ) : null}
                      <Button
                        onClick={() => handleCheckIn(key)}
                        style={{
                          borderRadius: "12px",
                          backgroundColor: isCheckedIn
                            ? "#34a0a4"
                            : "#2a6f97",
                          color: "white",
                        }}
                      >
                        {isCheckedIn ? "Checked In" : "Check In"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          } else {
            return null; // Do not render if the dietary restriction does not match
          }
        })}
      </div>
    </Layout>
  );
}

export default Search;
