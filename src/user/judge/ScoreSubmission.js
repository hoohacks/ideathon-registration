import "./ScheduleCard.css";
import { useEffect, useMemo, useRef, useState } from "react";

function ScoreSubmission({
  teamName = "Team Name",
  room = "Room 101",
  time = "10:00 AM",
  onClose = () => {},
  onSubmit = () => {},
}) {
  const [values, setValues] = useState({
    creativity: "5",
    cost: "5",
    idea: "5",
    notes: "",
  });
  const dialogRef = useRef(null);
  const oneToTen = useMemo(() => Array.from({ length: 10 }, (_, i) => `${i + 1}`), []);

  const [submitted, setSubmitted] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const score = {
      creativity: Number(values.creativity),
      cost: Number(values.cost),
      idea: Number(values.idea),
      notes: values.notes,
      teamName,
      room,
      time,
    };
    onSubmit(score);
    setSubmitted(true);
  }

  return (
    <div
      className="score-modal-overlay"
      aria-hidden="false"
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-modal-title"
    >
      <div className="score-modal__dialog" ref={dialogRef}>
        <header className="score-modal__header">
          <h2 id="score-modal-title" className="score-modal__title">
            Score Submission
          </h2>
          <button
            className="score-modal__close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            ×
          </button>
        </header>

        <div className="score-modal-team-info">
          <span className="score-chip">{teamName}</span>
          <span className="score-chip">{room}</span>
          <span className="score-chip">{time}</span>
        </div>

        <form className="score-modal__form" onSubmit={handleSubmit}>
          <label className="score-field">
            <span>Creativity</span>
            <select
              name="creativity"
              value={values.creativity}
              onChange={handleChange}
              required
            >
              {oneToTen.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label className="score-field">
            <span>Cost</span>
            <select
              name="cost"
              value={values.cost}
              onChange={handleChange}
              required
            >
              {oneToTen.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label className="score-field">
            <span>Idea</span>
            <select
              name="idea"
              value={values.idea}
              onChange={handleChange}
              required
            >
              {oneToTen.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label className="score-field score-field--textarea">
            <span>Notes</span>
            <textarea
              name="notes"
              value={values.notes}
              onChange={handleChange}
              placeholder="Optional notes for judges…"
              rows={4}
            />
          </label>

          <div className="score-modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">
              Submit Score
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ScoreSubmission;
