"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ModalPortal } from "@/components/modal-portal";

export type ResultRecord = {
  gradingStatus: "pending" | "graded";
  version: string;
  legacy: boolean;
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
    type?: string;
    awarded?: number;
    gradingSource?: "automatic" | "instructor";
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
  const router = useRouter();
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
    const response = await fetch(rows.find(row => row._id === id)?.legacy ? `/api/admin/forms/submissions/${id}` : `/api/admin/tests/results/${id}`, {
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
    router.refresh();
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
                  <strong>{row.gradingStatus === "pending" ? "Pending" : `${row.percent}%`}</strong>
                  {row.gradingStatus !== "pending" &&
                  <span className="help-text">
                    {row.right} of {row.marked}
                  </span>}
                </td>

                <td>
                  {row.gradingStatus === "pending" ? <button className="btn btn-sm" onClick={() => setOpenId(row._id)}>Grade</button> : row.passed === null ? (
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
          key={open._id}
          record={open}
          onGraded={record => { setRows(current => current.map(row => row._id === record._id ? record : row)); router.refresh(); }}
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
  onGraded,
  onClose,
  onDelete,
}: {
  record: ResultRecord;
  onGraded: (record: ResultRecord) => void;
  onClose: () => void;
  /** Absent where the reader may not remove one. */
  onDelete?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [awards, setAwards] = useState(record.questions.map(q => String(q.awarded ?? (q.correct ? q.points : 0))));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = record.gradingStatus === "pending";
  async function release() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/tests/results/${record._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: record.version, awards: awards.map(value => value.trim() === "" ? null : Number(value)) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not release the grade.");
      onGraded({ ...record, ...result.grade, version: result.version, gradingStatus: "graded" });
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }

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
            {error && <p role="alert" className="admin-notice is-error">{error}</p>}
            {pending && <p>Review the answers and points below, then release the grade to the test taker&rsquo;s dashboard.</p>}
            <p className="test-result-figure">
              <strong>{pending ? "Pending instructor review" : `${record.percent}%`}</strong>
              <span>
                {pending ? "Suggested automatic score: " : ""}
                {record.scored} of {record.available} points &middot; {record.right}{" "}
                of {record.marked} questions
              </span>

              {!pending && record.passed !== null ? (
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
                {record.questions.map((question, index) => {
                  const awaitingInstructor = pending && (question.gradingSource === "instructor" || question.expected === "Instructor assessment" || !question.expected);
                  return (
                  <li
                    key={question.questionId}
                    className={awaitingInstructor ? "is-pending" : question.correct ? "is-right" : "is-wrong"}
                  >
                    <span className="test-result-mark" aria-hidden="true">
                      {awaitingInstructor ? "\u25f7" : question.correct ? "\u2713" : "\u2717"}
                    </span>
                    <span className="test-result-question">
                      <strong>{question.label}</strong>
                      {awaitingInstructor && <span className="test-result-pending">Pending instructor review</span>}
                      <span className="help-text">{question.type || "Question"} · {pending ? question.points : `${question.awarded ?? (question.correct ? question.points : 0)} / ${question.points}`} points</span>
                      <span className="help-text">
                        Answered: {question.given || "nothing"}
                      </span>
                      {question.correct && !pending ? null : (
                        <span className="help-text">
                          Answer key: {question.expected || "Instructor assessment"}
                        </span>
                      )}
                      {pending && <label className="field">Points awarded
                        <input aria-label={`Points for question ${index + 1}`} type="number" min={0} max={question.points} step="any" value={awards[index]} disabled={saving} onChange={event => setAwards(values => values.map((value, i) => i === index ? event.target.value : value))} />
                      </label>}
                    </span>
                  </li>
                ); })}
              </ul>
            )}
          </div>

          <div className="style-modal-footer">
            {pending && <button type="button" className="btn btn-primary" disabled={saving} onClick={release}>{saving ? "Releasing…" : "Release grade"}</button>}
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
                Deleting removes this result from the test taker&rsquo;s dashboard.
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
