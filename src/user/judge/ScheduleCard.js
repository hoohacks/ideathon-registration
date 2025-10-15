import React from "react";
import "./ScheduleCard.css";

/**
 * ScheduleCard
 * Props:
 * - teamName: string
 * - room: string
 * - time: string
 * - onButtonClick: function
 */
function ScheduleCard({
  teamName = "Team Name",
  room = "Room 101",
  time = "10:00 AM",
  onButtonClick = () => {},
  disabled = false,
}) {
  return (
    <div
      className="schedule-card"
      role="article"
      aria-label={`Schedule for ${teamName}`}
    >
      <div className="schedule-card__content">
        <div className="schedule-card__title">{teamName}</div>
        <div className="schedule-card__meta">
          <div className="schedule-card__field">
            <span className="label">Room:</span> {room}
          </div>
          <div className="schedule-card__field">
            <span className="label">Time:</span> {time}
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`schedule-card__button ${disabled ? "is-disabled" : ""}`}
        onClick={(e) => {
          console.log('ScheduleCard clicked', { teamName, room, time, disabled });
          if (!disabled) onButtonClick({ teamName, room, time, event: e });
        }}
        disabled={disabled}
        aria-disabled={disabled}
      >
        {disabled ? "Scored" : "Score this Team"}
      </button>
    </div>
  );
}

export default ScheduleCard;
