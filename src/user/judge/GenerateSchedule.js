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
      {disabled ? "Generated" : "Generate Schedule"}
    </button>
  );
}

export default GenerateSchedule;
