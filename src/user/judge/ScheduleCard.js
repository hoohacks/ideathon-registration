import React from "react";
import "./ScheduleCard.css";

/**
 * ScheduleCard
 * Props:
 * - teamId: string (the database key -- team names are not unique, so scoring
 *   must be keyed off this rather than the name)
 * - teamName: string
 * - room: string
 * - time: string
 * - onButtonClick: function
 */
function ScheduleCard({
  teamId = null,
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
          if (!disabled) onButtonClick({ teamId, teamName, room, time, event: e });
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
