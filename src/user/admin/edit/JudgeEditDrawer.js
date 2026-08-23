import { useState } from "react";
import { Alert, MenuItem, TextField } from "@mui/material";
import EditDrawer from "../control/EditDrawer";
import { editJudge } from "../recordEdits";

/**
 * Fixing a judge record.
 *
 * isRound1Judge is here as well as on the row button, because this is where you
 * end up when you are correcting several fields at once. Both routes write the
 * same path; only this one records a before-value.
 */
export default function JudgeEditDrawer({ judge, onClose, onResult }) {
  const [fields, setFields] = useState({
    firstName: judge.firstName ?? "",
    lastName: judge.lastName ?? "",
    email: judge.email ?? "",
    company: judge.company ?? "",
    withCompany: Boolean(judge.withCompany),
    wantsToMentor: Boolean(judge.wantsToMentor),
    checkedIn: Boolean(judge.checkedIn),
    foodCheckIn: Boolean(judge.foodCheckIn),
    isRound1Judge: judge.isRound1Judge === true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setFields({ ...fields, [key]: event.target.value });
  const setBool = (key) => (event) => setFields({ ...fields, [key]: event.target.value === "true" });

  const original = (key) =>
    key === "isRound1Judge" ? judge.isRound1Judge === true : Boolean(judge[key]);

  const dirty = Object.entries(fields).some(([key, value]) =>
    typeof value === "boolean" ? value !== original(key) : value !== (judge[key] ?? "")
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await editJudge(judge.id, fields);
      if (!result.ok) { setError(result.error); return; }
      onResult(result, `Saved ${`${fields.firstName} ${fields.lastName}`.trim() || "judge"}`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const yesNo = (label, name, helperText) => (
    <TextField
      select
      size="small"
      label={label}
      value={String(fields[name])}
      onChange={setBool(name)}
      helperText={helperText}
    >
      <MenuItem value="true">Yes</MenuItem>
      <MenuItem value="false">No</MenuItem>
    </TextField>
  );

  return (
    <EditDrawer
      open
      title={`${judge.firstName ?? ""} ${judge.lastName ?? ""}`.trim() || "Judge"}
      subtitle={judge.email}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
      dirty={dirty}
    >
      <TextField label="First name" size="small" value={fields.firstName} onChange={set("firstName")} />
      <TextField label="Last name" size="small" value={fields.lastName} onChange={set("lastName")} />
      <TextField label="Email" size="small" value={fields.email} onChange={set("email")} />
      <TextField label="Company" size="small" value={fields.company} onChange={set("company")} />

      {yesNo("Show company", "withCompany")}
      {yesNo("Wants to mentor", "wantsToMentor")}
      {yesNo("Checked in", "checkedIn")}
      {yesNo("Got food", "foodCheckIn")}
      {yesNo(
        "First round judge",
        "isRound1Judge",
        "Only judges marked here are given team assignments"
      )}

      {fields.isRound1Judge !== (judge.isRound1Judge === true) && (
        <Alert severity="info">
          This takes effect the next time a schedule is generated. It does not add or
          remove assignments they already hold.
        </Alert>
      )}
    </EditDrawer>
  );
}
