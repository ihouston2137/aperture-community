"use client";

import {
  isChoiceType,
  isEntryEmpty,
  type MetadataEntry,
  type MetadataGroupSummary,
  type MetadataQuestion,
  type MetadataValue,
} from "@/lib/metadata-types";

/** An id for an entry being added, unique enough for a list being edited. */
function newEntryId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `e${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A whole group as it is answered: its questions, once or several times over.
 *
 * A group that does not repeat is drawn as one bare set of fields, exactly as
 * it was before repetition existed — the entry it holds is an implementation
 * detail nobody should have to see. A repeatable one numbers its entries and
 * offers another, up to whatever limit the group sets.
 */
export function MetadataEntries({
  group,
  entries,
  onChange,
  disabled = false,
  idPrefix,
}: {
  group: MetadataGroupSummary;
  entries: MetadataEntry[];
  onChange: (entries: MetadataEntry[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  // Always something to type into: an empty group would otherwise show its
  // name, its description, and nothing to answer.
  const shown =
    entries.length > 0 ? entries : [{ id: newEntryId(), values: [] }];

  function write(entryId: string, values: MetadataValue[]) {
    onChange(
      shown.map((entry) => (entry.id === entryId ? { ...entry, values } : entry))
    );
  }

  const one = group.entryLabel || "Entry";
  const atLimit =
    group.maxEntries > 0 && shown.length >= group.maxEntries;

  if (!group.isRepeatable) {
    return (
      <MetadataFields
        questions={group.questions}
        values={shown[0].values}
        onChange={(values) => write(shown[0].id, values)}
        disabled={disabled}
        idPrefix={idPrefix}
      />
    );
  }

  return (
    <>
      {shown.map((entry, index) => (
        <div key={entry.id} className="metadata-entry">
          <div className="metadata-entry-head">
            <strong>
              {one} {index + 1}
            </strong>

            {/* The first entry is removable too, once there is anything in it:
                somebody who filled in the wrong person should not have to
                clear five boxes by hand. */}
            {shown.length > 1 || !isEntryEmpty(group, entry) ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={disabled}
                onClick={() => {
                  const kept = shown.filter((held) => held.id !== entry.id);
                  onChange(
                    kept.length > 0 ? kept : [{ id: newEntryId(), values: [] }]
                  );
                }}
              >
                Remove
              </button>
            ) : null}
          </div>

          <MetadataFields
            questions={group.questions}
            values={entry.values}
            onChange={(values) => write(entry.id, values)}
            disabled={disabled}
            idPrefix={`${idPrefix}-${entry.id}`}
          />
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm"
        style={{ marginTop: "0.6rem" }}
        disabled={disabled || atLimit}
        onClick={() => onChange([...shown, { id: newEntryId(), values: [] }])}
      >
        Add another {one.toLowerCase()}
      </button>

      {atLimit ? (
        <span className="help-text">
          {group.maxEntries} is the most this asks for.
        </span>
      ) : null}
    </>
  );
}

/**
 * A set of metadata questions, as they are answered.
 *
 * One component for both sides of it: the member filling in their own on the
 * dashboard, and the manager filling in what is kept about somebody. The
 * questions are defined once and there is no reason for them to be drawn twice
 * — and if there were two, they would drift.
 *
 * Controlled by the caller, which holds the values, because the member's form
 * and the manager's dialog do different things with them on save.
 */
export function MetadataFields({
  questions,
  values,
  onChange,
  disabled = false,
  idPrefix,
}: {
  questions: MetadataQuestion[];
  values: MetadataValue[];
  onChange: (values: MetadataValue[]) => void;
  disabled?: boolean;
  /** Keeps ids unique when two sets are on one page. */
  idPrefix: string;
}) {
  const valueFor = (questionId: string): MetadataValue =>
    values.find((entry) => entry.questionId === questionId) ?? {
      questionId,
      text: "",
      choices: [],
    };

  function write(questionId: string, patch: Partial<MetadataValue>) {
    const existing = valueFor(questionId);
    const next = { ...existing, ...patch };
    onChange([
      ...values.filter((entry) => entry.questionId !== questionId),
      next,
    ]);
  }

  function toggleChoice(question: MetadataQuestion, option: string) {
    const held = valueFor(question.id).choices;

    if (question.type === "one") {
      write(question.id, { choices: [option], text: "" });
      return;
    }

    write(question.id, {
      choices: held.includes(option)
        ? held.filter((entry) => entry !== option)
        : [...held, option],
      text: "",
    });
  }

  return (
    <>
      {questions.map((question) => {
        const value = valueFor(question.id);
        const fieldId = `${idPrefix}-${question.id}`;

        return (
          <div key={question.id} className="field" style={{ marginTop: "0.875rem" }}>
            {isChoiceType(question.type) ? (
              <span className="field-label">
                {question.label}
                {question.isRequired ? " *" : ""}
              </span>
            ) : (
              <label htmlFor={fieldId}>
                {question.label}
                {question.isRequired ? " *" : ""}
              </label>
            )}

            {question.type === "short" ? (
              <input
                id={fieldId}
                type="text"
                value={value.text}
                disabled={disabled}
                onChange={(event) =>
                  write(question.id, { text: event.target.value, choices: [] })
                }
              />
            ) : null}

            {question.type === "number" ? (
              <input
                id={fieldId}
                type="number"
                inputMode="decimal"
                value={value.text}
                disabled={disabled}
                onChange={(event) =>
                  write(question.id, { text: event.target.value, choices: [] })
                }
              />
            ) : null}

            {question.type === "long" ? (
              <textarea
                id={fieldId}
                rows={4}
                value={value.text}
                disabled={disabled}
                onChange={(event) =>
                  write(question.id, { text: event.target.value, choices: [] })
                }
              />
            ) : null}

            {isChoiceType(question.type) ? (
              <div
                className="metadata-choices"
                role={question.type === "one" ? "radiogroup" : "group"}
                aria-label={question.label}
              >
                {question.options.map((option) => (
                  <label key={option} className="checkbox-row">
                    <input
                      type={question.type === "one" ? "radio" : "checkbox"}
                      name={`${fieldId}-choice`}
                      checked={value.choices.includes(option)}
                      disabled={disabled}
                      onChange={() => toggleChoice(question, option)}
                    />
                    {option}
                  </label>
                ))}

                {/* A radio group cannot be unpicked by clicking, and a member
                    who chose the wrong one should not have to ask somebody to
                    clear it. */}
                {question.type === "one" && value.choices.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={disabled}
                    onClick={() => write(question.id, { choices: [] })}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            ) : null}

            {question.help ? (
              <span className="help-text">{question.help}</span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
