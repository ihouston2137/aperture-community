"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  answerText,
  isAnswered,
  isChoiceType,
  type MetadataEntry,
  type MetadataGroupSummary,
  type MetadataQuestion,
} from "@/lib/metadata-types";

import { saveReportChoicesAction, type ReportChoiceChange } from "../actions";
import { AnswerButton } from "./answer-button";

export type ReportRow = {
  _id: string;
  name: string;
  isInactive: boolean;
  entries: MetadataEntry[];
  outstanding: number;
};

/** Stands in for a member who has answered nothing, so they still get a line. */
const EMPTY_ENTRY: MetadataEntry = { id: "none", values: [] };

function cellKey(userId: string, entryId: string, questionId: string) {
  return [userId, entryId, questionId].join("|");
}

function sameChoices(left: string[], right: string[]) {
  return left.length === right.length && left.every((choice) => right.includes(choice));
}

/**
 * Everybody's answers to a group, one row per entry.
 *
 * When the group allows it, an edit mode turns the choose-one and choose-any
 * cells into controls, so a committee settling who has paid or which kit went
 * out can work down the column rather than opening every member in turn. Only
 * the cells that changed are sent, and they are laid over what is on file.
 */
export function ReportTable({
  group,
  rows,
  showAnswers,
  canEdit,
  canEditInPlace,
}: {
  group: MetadataGroupSummary;
  rows: ReportRow[];
  showAnswers: boolean;
  canEdit: boolean;
  canEditInPlace: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Map<string, string[]>>(new Map());
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const choiceQuestions = group.questions.filter((question) =>
    isChoiceType(question.type)
  );
  const inPlace = canEditInPlace && choiceQuestions.length > 0;

  function stored(entry: MetadataEntry, question: MetadataQuestion) {
    return (
      entry.values.find((value) => value.questionId === question.id)?.choices ?? []
    );
  }

  function current(row: ReportRow, entry: MetadataEntry, question: MetadataQuestion) {
    return (
      draft.get(cellKey(row._id, entry.id, question.id)) ??
      stored(entry, question)
    );
  }

  function change(
    row: ReportRow,
    entry: MetadataEntry,
    question: MetadataQuestion,
    choices: string[]
  ) {
    setDraft((previous) => {
      const next = new Map(previous);
      const key = cellKey(row._id, entry.id, question.id);
      // Put back to what is on file, it is no longer a change.
      if (sameChoices(choices, stored(entry, question))) next.delete(key);
      else next.set(key, choices);
      return next;
    });
  }

  function stopEditing() {
    if (pending) return;
    setEditing(false);
    setDraft(new Map());
    setError("");
  }

  function save() {
    setError("");
    const changes: ReportChoiceChange[] = [...draft].map(([key, choices]) => {
      const [userId, entryId, questionId] = key.split("|");
      return { userId, entryId, questionId, choices };
    });
    if (changes.length === 0) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("groupId", group._id);
      formData.set("changes", JSON.stringify(changes));

      const result = await saveReportChoicesAction(formData);
      if (result.ok) {
        setEditing(false);
        setDraft(new Map());
        router.refresh();
      } else {
        setError(result.error ?? "Could not save those changes.");
      }
    });
  }

  function renderCell(row: ReportRow, entry: MetadataEntry, question: MetadataQuestion) {
    if (!showAnswers) {
      return isAnswered(question, entry.values) ? "answered" : "—";
    }

    if (!editing || !isChoiceType(question.type)) {
      return answerText(question, entry.values) || "—";
    }

    const chosen = current(row, entry, question);
    const label = `${question.label} for ${row.name}`;

    if (question.type === "one") {
      return (
        <select
          aria-label={label}
          value={chosen[0] ?? ""}
          disabled={pending}
          onChange={(event) =>
            change(row, entry, question, event.target.value ? [event.target.value] : [])
          }
        >
          <option value="">—</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <div className="checkbox-rows is-column" role="group" aria-label={label}>
        {question.options.map((option) => (
          <label key={option} className="checkbox-row">
            <input
              type="checkbox"
              checked={chosen.includes(option)}
              disabled={pending}
              onChange={(event) =>
                change(
                  row,
                  entry,
                  question,
                  event.target.checked
                    ? // In the order the question offers them, not the order ticked.
                      question.options.filter(
                        (candidate) => candidate === option || chosen.includes(candidate)
                      )
                    : chosen.filter((candidate) => candidate !== option)
                )
              }
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  // The row dialog saves a member's whole record, which would race the edits
  // being made here, so it steps aside while the report is being edited.
  const showAnswerColumn = canEdit && !editing;

  return (
    <>
      {inPlace ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.75rem",
          }}
        >
          {editing ? (
            <>
              <span className="help-text">
                {draft.size === 0
                  ? "Change any choice answer below, then save."
                  : `${draft.size} answer${draft.size === 1 ? "" : "s"} changed`}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={stopEditing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={pending || draft.size === 0}
                onClick={save}
              >
                {pending ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setEditing(true)}
            >
              Edit choices
            </button>
          )}
        </div>
      ) : null}

      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <div className="import-preview">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Member</th>
              {group.isRepeatable ? <th className="is-narrow">#</th> : null}
              {group.questions.map((question) => (
                <th key={question.id}>
                  {question.label}
                  {question.isRequired ? " *" : ""}
                </th>
              ))}
              {showAnswerColumn ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              /*
               * One row per entry, so a member with three emergency contacts
               * reads as three lines of a table rather than as three answers
               * crammed into every cell. A member with none still gets a row:
               * an empty line is the point of the report.
               */
              const lines = row.entries.length > 0 ? row.entries : [EMPTY_ENTRY];

              return lines.map((entry, index) => (
                <tr
                  key={`${row._id}-${entry.id}`}
                  className={index === 0 ? "is-entry-start" : undefined}
                >
                  {/* Spanning, so the name is said once however many entries
                      sit under it. */}
                  {index === 0 ? (
                    <td rowSpan={lines.length}>
                      {row.name}
                      {row.isInactive ? (
                        <span className="badge" style={{ marginLeft: "0.4rem" }}>
                          inactive
                        </span>
                      ) : null}
                      {row.outstanding > 0 ? (
                        <span className="help-text">
                          {row.outstanding} required unanswered
                        </span>
                      ) : null}
                    </td>
                  ) : null}

                  {group.isRepeatable ? (
                    <td className="is-narrow">
                      {row.entries.length > 0 ? index + 1 : "—"}
                    </td>
                  ) : null}

                  {group.questions.map((question) => (
                    <td key={question.id}>{renderCell(row, entry, question)}</td>
                  ))}

                  {showAnswerColumn && index === 0 ? (
                    <td rowSpan={lines.length}>
                      <AnswerButton
                        group={group}
                        userId={row._id}
                        userName={row.name}
                        entries={row.entries}
                      />
                    </td>
                  ) : null}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
