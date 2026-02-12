import { ref, get, set } from "firebase/database";
import { database } from "../../firebase";

export async function readGenerateScheduleFlag() {
  const snap = await get(ref(database, 'generate_schedule_bool'));
  if (!snap.exists()) return false;
  const val = snap.val();

  return val;
}

export async function writeGenerateScheduleFlag(value) {
  // write the flag as { bool: value } for clarity
  await set(ref(database, 'generate_schedule_bool'), { bool: !!value });
}

export default readGenerateScheduleFlag;
