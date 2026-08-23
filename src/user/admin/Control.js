import { useEffect, useState } from "react";
import { Alert, Snackbar, Stack } from "@mui/material";
import { onValue, ref, query, limitToLast } from "firebase/database";
import { database } from "../../firebase";
import Layout from "../Layout";
import { PageHeader } from "./adminUi";
import RoomsSection from "./control/RoomsSection";
import ScheduleSection from "./control/ScheduleSection";
import EventSection from "./control/EventSection";
import AdminsSection from "./control/AdminsSection";
import ActivityFeed from "./control/ActivityFeed";
import DangerSection from "./control/DangerSection";

/**
 * Everything that had no home before: the judging rooms, the batch shape, the
 * event date, who counts as an organiser, and the actions you reach for when
 * something has gone wrong.
 *
 * One subscription lives here and the data goes down as props. Sections call
 * services and never write directly -- the services put each change and its
 * audit entry into one atomic update, and the change comes back up through
 * these same subscriptions, so nothing here holds a mirror copy of state.
 */
function Control() {
  const [config, setConfig] = useState({});
  const [admins, setAdmins] = useState([]);
  const [teamsData, setTeamsData] = useState({});
  const [log, setLog] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const stop = [
      onValue(ref(database, "config"), (snap) => setConfig(snap.val() ?? {})),
      onValue(ref(database, "admins"), (snap) => setAdmins(Object.keys(snap.val() ?? {}))),
      onValue(ref(database, "teams"), (snap) => setTeamsData(snap.val() ?? {})),
      onValue(query(ref(database, "adminLog"), limitToLast(100)), (snap) => {
        const entries = Object.entries(snap.val() ?? {}).map(([id, entry]) => ({ id, ...entry }));
        // push keys are chronological, so newest-first is a reverse of key order
        setLog(entries.reverse());
      }),
    ];
    return () => stop.forEach((fn) => fn());
  }, []);

  /** Every section reports through here, so success and failure look the same. */
  const report = (result, successMessage) => {
    if (result?.ok) setToast({ severity: "success", message: successMessage });
    else setToast({ severity: "error", message: result?.error ?? "Something went wrong." });
    return result;
  };

  return (
    <Layout maxWidth="lg">
      <PageHeader
        title="Control panel"
        stats={[
          { label: "rooms", value: (config.judgingRooms ?? []).length },
          { label: "organisers", value: admins.length },
          { label: "recent changes", value: log.length },
        ]}
      />

      <Stack spacing={3}>
        <RoomsSection
          rooms={config.judgingRooms ?? []}
          teamsData={teamsData}
          onResult={report}
        />
        <ScheduleSection config={config} onResult={report} />
        <EventSection config={config} onResult={report} />
        <AdminsSection admins={admins} onResult={report} />
        <ActivityFeed log={log} onResult={report} />
        <DangerSection onResult={report} />
      </Stack>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Layout>
  );
}

export { Control };
export default Control;
