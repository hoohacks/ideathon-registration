import "./GenerateSchedule.css";

function GenerateSchedule({ onButtonClick = () => {}, disabled = false }) {
  return (
    <button
      type="button"
      className="generate-schedule-button"
      onClick={(e) => {
        if (!disabled) onButtonClick(e);
      }}
      disabled={disabled}
    >
      {disabled ? "Judging Schedule Generated" : "Generate New Judging Schedule"}
    </button>
  );
}

export default GenerateSchedule;
