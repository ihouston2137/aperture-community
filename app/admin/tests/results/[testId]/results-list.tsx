"use client";

import { useEffect, useState } from "react";

import { ModalPortal } from "@/components/modal-portal";

export type ResultRecord = {
  _id: string;
  /** `Last, First`, which is what the list is ordered and read by. */
  name: string;
  attempts: number;
  percent: number;
  scored: number;
  available: number;
  right: number;
  marked: number;
  takenAt: string;
  questions: {
    questionId: string;
    label: string;
    points: number;
    correct: boolean;
    given?: string;
    expected?: string;
  }[];
};

/**
 * A test's results, a row per person.
 *
 * One row each rather than one per sitting: a retake is the same person trying
 * again, and what a results list answers is how well each of them can do it.
 * The attempt count is beside the mark, so a first-time pass and a fourth-time
 * pass are told apart without being two rows.
 */
export function TestResultsList({ records }: { records: ResultRecord[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = records.find((row) => row._id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (records.length === 0) {
    return <p className="admin-subtitle">No results yet.</p>;
  }

  return (
    <>
      <div className="submission-rows">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="is-figure">Result</th>
              <th className="is-figure">Attempts</th>
              <th>Best sitting</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr
                key={row._id}
                className="is-openable"
                onClick={() => setOpenId(row._id)}
              >
                <th scope="row">
                  <button
                    type="button"
                    className="link-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenId(row._id);
                    }}
                  >
                    {row.name}
                  </button>
                </th>

                <td className="is-figure">
                  <strong>{row.percent}%</strong>
                  <span className="help-text">
                    {row.right} of {row.marked}
                  </span>
                </td>

                <td className="is-figure">{row.attempts}</td>
                <td>{new Date(row.takenAt).toLocaleString()}</td>
                <td className="is-narrow" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? <ResultDialog record={open} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

/** One person's paper, marked. */
function ResultDialog({
  record,
  onClose,
}: {
  record: ResultRecord;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div className="style-modal-backdrop" onClick={onClose}>
        <div
          className="style-modal is-wide"
          role="dialog"
          aria-modal="true"
          aria-label={`${record.name}'s result`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="style-modal-header">
            <div style={{ minWidth: 0 }}>
              <h2 className="panel-title" style={{ margin: 0 }}>
                {record.name}
              </h2>
              <span className="admin-list-meta">
                {new Date(record.takenAt).toLocaleString()} ·{" "}
                {record.attempts} attempt{record.attempts === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="style-modal-body">
            <p className="test-result-figure">
              <strong>{record.percent}%</strong>
              <span>
                {record.scored} of {record.available} points &middot; {record.right}{" "}
                of {record.marked} questions
              </span>
            </p>

            {record.questions.length === 0 ? (
              <p className="admin-subtitle">
                This sitting was recorded before the per-question marking was
                kept, so only the total is known.
              </p>
            ) : (
              <ul className="test-result-list">
                {record.questions.map((question) => (
                  <li
                    key={question.questionId}
                    className={question.correct ? "is-right" : "is-wrong"}
                  >
                    <span className="test-result-mark" aria-hidden="true">
                      {question.correct ? "\u2713" : "\u2717"}
                    </span>
                    <span className="test-result-question">
                      <strong>{question.label}</strong>
                      <span className="help-text">
                        Answered: {question.given || "nothing"}
                      </span>
                      {question.correct ? null : (
                        <span className="help-text">
                          Correct: {question.expected}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="style-modal-footer">
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: "auto" }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
