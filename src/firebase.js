// Import the functions you need from the SDKs you need
//import { getAnalytics } from "firebase/analytics";
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { firebaseConfig } from "./firebaseConfig";

/**
 * Point the whole app at the local emulators when REACT_APP_USE_EMULATOR is set.
 *
 * Without this there was no way to exercise the app end to end at all: every
 * `npm start` talked to the live project, so rehearsing a schedule generation,
 * a score submission or anything in the danger zone wrote to the real event.
 * The automated suites covered the rules and the arithmetic; the one thing they
 * could not cover was a person clicking through the actual day.
 *
 * `npm run start:emulator` sets the flag. It is read at build time by Create
 * React App, so a production bundle cannot accidentally carry it -- the
 * deployed site has no branch that can reach a localhost emulator.
 */
export const USING_EMULATOR = process.env.REACT_APP_USE_EMULATOR === "true";

const EMULATOR_HOST = process.env.REACT_APP_EMULATOR_HOST || "127.0.0.1";

/**
 * The emulator namespace, which is NOT derived from firebaseConfig.
 *
 * This is the subtle part. `connectDatabaseEmulator` keeps the namespace from
 * the configured databaseURL, so it would connect to a namespace called
 * `ideathon-2026-d6950-default-rtdb` on the emulator -- a real, empty database
 * that is not the one the seed script and the rules suite use. Reads then
 * succeed and return nothing, which looks exactly like a signed-in user with no
 * roles and is thoroughly confusing to debug.
 *
 * Passing the URL to getDatabase instead pins the namespace explicitly, and
 * `demo-ideathon` is the same one scripts/seed-event.mjs writes and
 * test/rules/ runs against. Keep the three in step.
 */
export const EMULATOR_NAMESPACE = "demo-ideathon";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
//export const analytics = getAnalytics(app);
export const storage = getStorage(app);
export const database = USING_EMULATOR
  ? getDatabase(app, `http://${EMULATOR_HOST}:9000?ns=${EMULATOR_NAMESPACE}`)
  : getDatabase(app);
export const auth = getAuth(app);

if (USING_EMULATOR) {
  connectStorageEmulator(storage, EMULATOR_HOST, 9199);
  // disableWarnings only silences the banner the SDK prints; the emulator is
  // still refusing to do anything real with these credentials
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });

  // eslint-disable-next-line no-console
  console.info(
    `%cEMULATOR MODE%c database :9000 (ns=${EMULATOR_NAMESPACE}) · auth :9099 · storage :9199 — ` +
      `nothing here touches ${firebaseConfig.projectId}`,
    "background:#0B6E6D;color:#fff;padding:2px 6px;border-radius:3px;font-weight:600",
    "color:#0B6E6D"
  );
}
