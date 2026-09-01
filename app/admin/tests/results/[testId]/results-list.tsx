"use client";

import { useEffect, useState } from "react";

import { ModalPortal } from "@/components/modal-portal";

export type ResultRecord = {
  _id: string;
  /** `Last, First`, which is what the list is ordered and read by. */
  name: string;
  attempts: number;
  percent: number;
  /** The threshold the result was judged against, and whether it made it. */
  passMark: number;
  passed: boolean | null;
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
 * One row each rather than one per attempt: a retake is the same person trying
 * again, and what a results list answers is how well each of them can do it.
 * The attempt count is beside the mark, so a first-time pass and a fourth-time
 * pass are told apart without being two rows.
 */
export function TestResultsList({
  records,
  canDelete,
}: {
  records: ResultRecord[];
  /** Whoever may read results may also remove one — see the note on `remove`. */
  canDelete: boolean;
}) {
  const [rows, setRows] = useState(records);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const open = rows.find((row) => row._id === openId) ?? null;

  /*
   * Remove one result.
   *
   * Which is also how somebody is let back in: the attempt count lives on the
   * record, so taking it away returns them to nought attempts. That is the
   * point rather than a side effect — a candidate cut off mid-test, or one who
   * sat it by mistake, needs the result gone and another go.
   */
  async function remove(id: string) {
    setError("");
    const response = await fetch(`/api/admin/forms/submissions/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? "That result could not be deleted.");
      return;
    }

    setRows((current) => current.filter((row) => row._id !== id));
    setConfirming(null);
    setOpenId((current) => (current === id ? null : current));
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (rows.length === 0) {
    return (
      <p className="admin-subtitle">
        {records.length === 0 ? "No results yet." : "Every result has been deleted."}
      </p>
    );
  }

  return (
    <>
      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <div className="submission-rows">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="is-figure">Result</th>
              <th>Outcome</th>
              <th className="is-figure">Attempts</th>
              <th>Taken</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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

                <td>
                  {row.passed === null ? (
                    <span className="help-text">not judged</span>
                  ) : (
                    <span
                      className="test-result-verdict"
                      data-passed={row.passed ? "true" : "false"}
                    >
                      {row.passed ? "Passed" : "Not passed"}
                    </span>
                  )}
                </td>

                <td className="is-figure">{row.attempts}</td>
                <td>{new Date(row.takenAt).toLocaleString()}</td>

                <td className="is-narrow">
                  {!canDelete ? null : confirming === row._id ? (
                    <span className="admin-list-actions">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          remove(row._id);
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirming(null);
                        }}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirming(row._id);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <ResultDialog
          record={open}
          onClose={() => setOpenId(null)}
          onDelete={canDelete ? () => remove(open._id) : undefined}
        />
      ) : null}
    </>
  );
}

/** One person's paper, marked. */
function ResultDialog({
  record,
  onClose,
  onDelete,
}: {
  record: ResultRecord;
  onClose: () => void;
  /** Absent where the reader may not remove one. */
  onDelete?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

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

              {record.passed !== null ? (
                <span
                  className="test-result-verdict"
                  data-passed={record.passed ? "true" : "false"}
                >
                  {record.passed ? "Passed" : "Not passed"}
                  <span className="help-text">
                    {record.passMark}% needed at the time
                  </span>
                </span>
              ) : null}
            </p>

            {record.questions.length === 0 ? (
              <p className="admin-subtitle">
                This result was recorded before the per-question marking was
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
            {onDelete ? (
              confirming ? (
                <>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={onDelete}
                  >
                    Yes, delete this result
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirming(true)}
                >
                  Delete
                </button>
              )
            ) : null}

            {/* Said where the decision is made: deleting the record is how
                somebody who used up their attempts is let back in. */}
            {onDelete && !confirming ? (
              <span className="help-text" style={{ maxWidth: "20rem" }}>
                Deleting this returns them to no attempts, so they may take the
                test again.
              </span>
            ) : null}

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
