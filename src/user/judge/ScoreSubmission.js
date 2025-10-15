import "./ScheduleCard.css";
import { useMemo, useRef, useState } from "react";

function ScoreSubmission({
  teamName = "Team Name",
  room = "Room 101",
  time = "10:00 AM",
  onClose = () => {},
  onSubmit = () => {},
}) {
  const [values, setValues] = useState({
    problem: "5",
    innovation: "5",
    impact: "5",
    viability: "5",
    pitch_quality: "5",
    fundable: "5",
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
      problem: Number(values.problem),
      innovation: Number(values.innovation),
      impact: Number(values.impact),
      viability: Number(values.viability),
      pitch_quality: Number(values.pitch_quality),
      fundable: Number(values.fundable),
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

        <div className="score-modal__body">
          <div className="score-modal-team-info">
            <span className="score-chip">{teamName}</span>
            <span className="score-chip">{room}</span>
            <span className="score-chip">{time}</span>
          </div>

          <form className="score-modal__form" onSubmit={handleSubmit}>
            <label className="score-field">
              <span>Problem</span>
              <select
                name="problem"
                value={values.problem}
                onChange={handleChange}
                required
              >
                {oneToTen.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <label className="score-field">
              <span>Innovation</span>
              <select
                name="innovation"
                value={values.innovation}
                onChange={handleChange}
                required
              >
                {oneToTen.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <label className="score-field">
              <span>Impact</span>
              <select
                name="impact"
                value={values.impact}
                onChange={handleChange}
                required
              >
                {oneToTen.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <label className="score-field">
              <span>Viability</span>
              <select
                name="viability"
                value={values.viability}
                onChange={handleChange}
                required
              >
                {oneToTen.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <label className="score-field">
              <span>Pitch Quality</span>
              <select
                name="pitch_quality"
                value={values.pitch_quality}
                onChange={handleChange}
                required
              >
                {oneToTen.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <label className="score-field">
              <span>Fundable</span>
              <select
                name="fundable"
                value={values.fundable}
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
    </div>
  );
}

export default ScoreSubmission;
