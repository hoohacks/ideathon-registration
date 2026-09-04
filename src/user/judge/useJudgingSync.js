import { useCallback, useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "../../firebase.js";
import { listPending, subscribeToPending } from "./pendingScores.js";
import { syncPendingScores } from "./getTeamInfo.js";

/**
 * Connection state plus the outbox, for the judging screens.
 *
 * `.info/connected` is a Realtime Database pseudo-node reflecting the socket,
 * which is a truer signal than `navigator.onLine` — a venue captive portal
 * leaves the browser convinced it is online while every write hangs.
 *
 * Draining is triggered by the transition into connected, not by a timer, so a
 * judge who walks back into signal syncs immediately rather than on a poll.
 *
 * A queued card syncs only while this page is open, which makes closing the tab
 * the one action that can still lose a score outright -- the card sits on that
 * device, nobody else can see it, and Judging progress reports the team as
 * unjudged. The browser gives exactly one tool for that, and this uses it.
 */
export function useJudgingSync(judgeUid) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(() => listPending(judgeUid));
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setPending(listPending(judgeUid));
    return subscribeToPending(() => setPending(listPending(judgeUid)));
  }, [judgeUid]);

  const retry = useCallback(async () => {
    if (!judgeUid) return { synced: 0, failed: 0 };
    setSyncing(true);
    try {
      return await syncPendingScores(judgeUid);
    } catch (error) {
      console.warn("Could not sync queued scores:", error);
      return { synced: 0, failed: 0 };
    } finally {
      setSyncing(false);
    }
  }, [judgeUid]);

  useEffect(() => {
    if (!judgeUid) return undefined;

    let wasConnected = false;
    const unsubscribe = onValue(ref(database, ".info/connected"), (snap) => {
      const connected = snap.val() === true;
      setOnline(connected);
      // only on the rising edge; the node also fires on first subscribe
      if (connected && !wasConnected && listPending(judgeUid).length) retry();
      wasConnected = connected;
    });

    // and once on mount, for anything queued in a previous session
    if (listPending(judgeUid).length) retry();

    return () => unsubscribe();
  }, [judgeUid, retry]);

  // The only thing standing between a queued card and a lost score. Registered
  // only while something is actually queued, so a judge who owes nothing is
  // never asked whether they meant to leave.
  useEffect(() => {
    if (!pending.length) return undefined;

    const warn = (event) => {
      event.preventDefault();
      // browsers ignore the text and show their own, but a value must be set
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending.length]);

  return {
    online,
    pending,
    pendingCount: pending.length,
    pendingTeamIds: new Set(pending.map((entry) => entry.teamId)),
    syncing,
    retry,
  };
}

export default useJudgingSync;
