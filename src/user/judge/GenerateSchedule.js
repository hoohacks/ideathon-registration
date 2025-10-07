import "./GenerateSchedule.css";

function GenerateSchedule({
  onButtonClick = () => {},
}) {
    return (
        <button
            type="button"
            className="generate-schedule-button"
            onClick={(e) => {
            onButtonClick(e);
            }}
        >
            Generate Schedule
        </button>
    );
}

export default GenerateSchedule;