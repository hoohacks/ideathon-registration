import "./ScheduleCard.css";
import { useMemo, useRef, useState } from "react";

const rubric = {
  problem: {
    label: "Problem",
    range: 10,
    desc: `• Does the submission identify and describe an addressable need, want, problem, and/or opportunity in society?
• Does the submission identify a target customer base?`,
  },
  innovation: {
    label: "Innovation",
    range: 10,
    desc: `• Does the submission present a novel, original, and compelling solution, whether product or service, for addressing some need, want, problem, and/or opportunity in the world?
• Does the submission describe the alternative solutions while making a compelling case on how their idea is an improvement over these alternatives?`,
  },
  impact: {
    label: "Impact",
    range: 10,
    desc: `• Does the submission discuss the impact it will make? How large of an impact?
• How strongly did the submission discuss how stakeholders and potential users/customers/beneficiaries could potentially benefit from this idea`,
  },
  viability: {
    label: "Viability",
    range: 5,
    desc: `• Is the submission feasible? How hard would it be to implement?
• How strongly did the submission understand, address, and incorporate risks, cost, timeframe, or measures of success?`,
  },
  pitch_quality: {
    label: "Pitch Quality",
    range: 5,
    desc: `• How well did they present? Were they confident? Did they have a professional presentation?
• Did they have appropriate evidence and information to support their idea?`,
  },
  fundable: {
    label: "Fundable",
    yesNo: true,
    desc: `Is this an idea that would greatly benefit from funding given by HooHacks?`,
  },
};


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
    fundable: "yes",
    notes: "",
  });
  const dialogRef = useRef(null);
  const oneToTen = useMemo(() => Array.from({ length: 10 }, (_, i) => `${i + 1}`), []);
  const scoreOptions = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

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
      fundable: values.fundable === "yes",
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
              <span>{rubric.problem.label}</span>
              <details className="score-help-collapsible">
                <summary>What to consider</summary>
                <div className="score-help">{rubric.problem.desc}</div>
              </details>              
              <select
                name="problem"
                value={values.problem}
                onChange={handleChange}
                required
              >
              {scoreOptions(rubric.problem.range).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <label className="score-field">
              <span>{rubric.innovation.label}</span>
              <details className="score-help-collapsible">
                <summary>What to consider</summary>
                <div className="score-help">{rubric.innovation.desc}</div>
              </details>
              <select
                name="innovation"
                value={values.innovation}
                onChange={handleChange}
                required
              >
                {scoreOptions(rubric.innovation.range).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <label className="score-field">
              <span>{rubric.impact.label}</span>
              <details className="score-help-collapsible">
                <summary>What to consider</summary>
                <div className="score-help">{rubric.impact.desc}</div>
              </details>              
              <select
                name="impact"
                value={values.impact}
                onChange={handleChange}
                required
              >
                {scoreOptions(rubric.impact.range).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <label className="score-field">
              <span>{rubric.viability.label}</span>
              <details className="score-help-collapsible">
                <summary>What to consider</summary>
                <div className="score-help">{rubric.viability.desc}</div>
              </details>
              <select
                name="viability"
                value={values.viability}
                onChange={handleChange}
                required
              >
              {scoreOptions(rubric.viability.range).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <label className="score-field">
              <span>{rubric.pitch_quality.label}</span>
              <details className="score-help-collapsible">
                <summary>What to consider</summary>
                <div className="score-help">{rubric.pitch_quality.desc}</div>
              </details>
              <select
                name="pitch_quality"
                value={values.pitch_quality}
                onChange={handleChange}
                required
              >
              {scoreOptions(rubric.pitch_quality.range).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <label className="score-field">
              <span>{rubric.fundable.label}</span>
              <details className="score-help-collapsible">
                <summary>What to consider</summary>
                <div className="score-help">{rubric.fundable.desc}</div>
              </details>
              <div role="radiogroup" aria-label="Fundable" style={{ display: "flex", gap: 12 }}>
                <label>
                  <input
                    type="radio"
                    name="fundable"
                    value="yes"
                    checked={values.fundable === "yes"}
                    onChange={handleChange}
                  />{" "}
                  Yes
                </label>
                <label>
                  <input
                    type="radio"
                    name="fundable"
                    value="no"
                    checked={values.fundable === "no"}
                    onChange={handleChange}
                  />{" "}
                  No
                </label>
              </div>
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
