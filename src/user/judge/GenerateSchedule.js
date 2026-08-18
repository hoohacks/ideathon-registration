import "./GenerateSchedule.css";

function GenerateSchedule({
  onButtonClick = () => {},
  busy = false,
  generated = false,
}) {
  const label = busy
    ? "Generating..."
    : generated
    ? "Regenerate Schedule"
    : "Generate Schedule";

  return (
    <button
      type="button"
      className="generate-schedule-button"
      onClick={(e) => {
        if (!busy) onButtonClick(e);
      }}
      disabled={busy}
    >
      {label}
    </button>
  );
}

export default GenerateSchedule;
