"use client";

import {
  isChoiceType,
  type MetadataQuestion,
  type MetadataValue,
} from "@/lib/metadata-types";

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
