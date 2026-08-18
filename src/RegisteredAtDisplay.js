// RegisteredAtDisplay.js

import { onValue, ref } from "firebase/database";
import React, { useEffect, useMemo, useState } from "react";
import { database } from "./firebase";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import Layout from "./user/Layout";

function dayKey(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function RegisteredAtDisplay() {
  const [registeredAt, setRegisteredAt] = useState([]);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, "/competitors/"), (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setRegisteredAt([]);
        return;
      }
      setRegisteredAt(
        Object.values(data)
          .map((entry) => entry?.registeredAt)
          .filter(Boolean)
      );
    });

    return () => unsubscribe();
  }, []);

  // One pass over the data instead of makeX/makeY recomputing on every render,
  // and counting from the first record rather than the second.
  const { labels, perDay, cumulative } = useMemo(() => {
    const counts = new Map();

    for (const value of registeredAt) {
      const key = dayKey(value);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sorted = [...counts.keys()].sort((a, b) => {
      const [aMonth, aDay] = a.split("/").map(Number);
      const [bMonth, bDay] = b.split("/").map(Number);
      return aMonth === bMonth ? aDay - bDay : aMonth - bMonth;
    });

    let total = 0;
    const daily = sorted.map((key) => counts.get(key));
    const running = daily.map((count) => (total += count));

    return { labels: sorted, perDay: daily, cumulative: running };
  }, [registeredAt]);

  const line = (label, data) => ({
    labels,
    datasets: [
      {
        label,
        data,
        fill: false,
        borderWidth: 4,
        borderColor: "#6495ed",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        responsive: true,
      },
    ],
  });

  return (
    <Layout>
      <h1 style={{ textAlign: "center" }}>Registration Metrics</h1>
      <p style={{ textAlign: "center" }}>
        {registeredAt.length} competitor{registeredAt.length === 1 ? "" : "s"} registered
        across {labels.length} day{labels.length === 1 ? "" : "s"}
      </p>
      <div>
        <Line data={line("# of Participants Registered", perDay)} />
      </div>
      <div>
        <Line data={line("Total Participants Registered", cumulative)} />
      </div>
    </Layout>
  );
}

export default RegisteredAtDisplay;
