"use client";

import { useState } from "react";

import { AdminHeader, Panel } from "@/components/admin-ui";
import { FormFieldView } from "@/components/form-shell";
import {
  FILE_UPLOAD_KINDS,
  OPTION_LAYOUTS,
  normalizeFormSettings,
  type FormBlock,
  type FormBlockType,
  type FormSettings,
  type OptionLayout,
} from "@/lib/form-layout";
import {
  GRADABLE_TYPES,
  TEST_RESULT_LABELS,
  TEST_RESULT_MODES,
  TEXT_MATCH_MODES,
  createTestQuestion,
  createTestVariant,
  isGradable,
  keyKindFor,
  type AnswerKey,
  type TestQuestion,
  type TestResultMode,
  type TestSettings,
  type TestVariant,
} from "@/lib/form-test";

import { InlineStyleEditor, type SavedStyle } from "@/components/style-editor";
import type { StyleSlot } from "@/lib/display-templates";

import { saveTestAction } from "./actions";

/**
 * The question types a test can ask.
 *
 * Everything that can be marked, plus a file upload — a test can ask for a
 * photograph, and that question simply counts towards nothing.
 */
const QUESTION_TYPES: FormBlockType[] = [...GRADABLE_TYPES, "file"];

const TYPE_LABELS: Record<string, string> = {
  shortText: "Short text",
  longText: "Long text",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  radio: "Radio group",
  checkbox: "Checkbox",
  checkboxGroup: "Checkbox group",
  file: "File upload",
};

export type TestRecord = {
  _id?: string;
  title: string;
  slug: string;
  status: string;
  settings: FormSettings;
  test: TestSettings;
};

/**
 * The test editor.
 *
 * No canvas and no columns: a test is a list of questions and one follows
 * another, so laying it out by hand would be work the shape of the thing has
 * already done. What is left to author is the questions, their variants, and
 * what counts as right — which is what this page is.
 */
/** The style slots a test dresses, all edited in one fold each. */
const TEST_STYLE_SLOTS = [
  { key: "titleStyle", label: "Title", where: "test" },
  { key: "instructionsStyle", label: "Instructions", where: "test" },
  { key: "formStyle", label: "The paper", where: "form" },
  { key: "labelStyle", label: "Question text", where: "form" },
  { key: "fieldStyle", label: "Answer fields", where: "form" },
  { key: "placeholderStyle", label: "Placeholder text", where: "form" },
  { key: "helpStyle", label: "Help text", where: "form" },
  { key: "successStyle", label: "The result", where: "form" },
] as const;

export function TestBuilder({
  test: initial,
  fonts,
  savedStyles,
}: {
  test: TestRecord;
  /** Design-library fonts and named styles, for the style folds. */
  fonts: string[];
  savedStyles: SavedStyle[];
}) {
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [status, setStatus] = useState(initial.status);
  const [settings, setSettings] = useState<FormSettings>(initial.settings);
  const [test, setTest] = useState<TestSettings>(initial.test);

  const previewSettings = normalizeFormSettings(settings);

  function patchTest(patch: Partial<TestSettings>) {
    setTest((current) => ({ ...current, ...patch }));
  }

  function patchQuestion(questionId: string, patch: Partial<TestQuestion>) {
    patchTest({
      questions: test.questions.map((question) =>
        question.id === questionId ? { ...question, ...patch } : question
      ),
    });
  }

  function patchVariant(
    questionId: string,
    variantId: string,
    patch: Partial<TestVariant>
  ) {
    const question = test.questions.find((entry) => entry.id === questionId);
    if (!question) return;
    patchQuestion(questionId, {
      variants: question.variants.map((variant) =>
        variant.id === variantId ? { ...variant, ...patch } : variant
      ),
    });
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= test.questions.length) return;
    const next = [...test.questions];
    [next[index], next[target]] = [next[target], next[index]];
    patchTest({ questions: next });
  }

  const askable = test.questions.length;
  const ungraded = test.questions.filter((question) =>
    question.variants.every((variant) => !isGradable(variant.block, variant.key))
  ).length;

  return (
    <>
      <form action={saveTestAction} id="test-form">
        {initial._id ? <input type="hidden" name="id" value={initial._id} /> : null}
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="settings" value={JSON.stringify(settings)} />
        <input type="hidden" name="test" value={JSON.stringify(test)} />
      </form>

      <AdminHeader
        title={initial._id ? "Edit test" : "New test"}
        subtitle="Questions are asked one to a row, in this order."
        actions={
          <button type="submit" form="test-form" className="btn btn-primary">
            Save
          </button>
        }
      />

      <Panel title="The test">
        <div className="inspector-grid">
          <div className="field">
            <label htmlFor="test-title">Title</label>
            <input
              id="test-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="test-slug">Address</label>
            <input
              id="test-slug"
              value={slug}
              placeholder="left blank, made from the title"
              onChange={(event) => setSlug(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="test-status">Status</label>
            <select
              id="test-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
      </Panel>

      <Panel title="What it says">
        <div className="field">
          <label htmlFor="test-instructions">Instructions</label>
          <textarea
            id="test-instructions"
            rows={4}
            value={test.instructions}
            placeholder="What to do before starting, how long it should take, what is allowed."
            onChange={(event) => patchTest({ instructions: event.target.value })}
          />
          <span className="help-text">
            Shown under the title, before the questions. Line breaks are kept,
            so a list of rules reads as a list.
          </span>
        </div>
      </Panel>

      <Panel title="How it is given">
        <div className="inspector-grid">
          <div className="field">
            <label htmlFor="test-ask">Questions asked</label>
            <input
              id="test-ask"
              type="number"
              min={0}
              max={askable}
              value={test.askCount}
              onChange={(event) =>
                patchTest({
                  askCount: Math.max(
                    0,
                    Math.min(askable, Number(event.target.value) || 0)
                  ),
                })
              }
            />
            <span className="help-text">
              {test.askCount > 0 && test.askCount < askable
                ? `${test.askCount} drawn from ${askable}, graded out of ${test.askCount}.`
                : `0 asks all ${askable}.`}
            </span>
          </div>

          <div className="field">
            <label htmlFor="test-result">After sending, show</label>
            <select
              id="test-result"
              value={test.resultMode}
              onChange={(event) =>
                patchTest({ resultMode: event.target.value as TestResultMode })
              }
            >
              {TEST_RESULT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {TEST_RESULT_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field" style={{ maxWidth: "16rem" }}>
          <label htmlFor="test-attempts">Times one person may sit it</label>
          <input
            id="test-attempts"
            type="number"
            min={0}
            max={50}
            value={test.attemptLimit}
            onChange={(event) =>
              patchTest({
                attemptLimit: Math.max(0, Math.min(50, Number(event.target.value) || 0)),
              })
            }
          />
          <span className="help-text">
            {test.attemptLimit === 0
              ? "Zero is as often as they like."
              : `Their best sitting is the one kept, whichever of the ${test.attemptLimit} it was.`}{" "}
            Counted per person, which is why a test asks somebody to sign in.
          </span>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={test.shuffleQuestions}
            onChange={(event) => patchTest({ shuffleQuestions: event.target.checked })}
          />
          Shuffle the order of the questions
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={test.shuffleOptions}
            onChange={(event) => patchTest({ shuffleOptions: event.target.checked })}
          />
          Shuffle the choices inside each question
        </label>

        <p className="help-text">
          The three ways of varying a sitting compose: a pool is drawn from, a
          variant is picked for each question drawn, then the order is shuffled.
          Using none of them gives the same paper every time.
        </p>
      </Panel>

      <Panel title="How it looks">
        <p className="help-text" style={{ marginBottom: "0.75rem" }}>
          The first two dress the top of the page; the rest dress the paper and
          the fields on it, exactly as they do on a form.
        </p>

        {TEST_STYLE_SLOTS.map((slot) => {
          const value =
            slot.where === "test"
              ? test[slot.key as "titleStyle" | "instructionsStyle"]
              : settings[slot.key as keyof FormSettings];
          const held = value as StyleSlot;

          return (
            <details key={slot.key} className="inspector-fold is-top">
              <summary>
                {slot.label}
                <span className="help-text">
                  {held.styleSlug
                    ? held.styleSlug
                    : Object.keys(held.style ?? {}).length > 0
                      ? "set"
                      : "unset"}
                </span>
              </summary>
              <div className="inspector-fold-body">
                <InlineStyleEditor
                  values={held.style}
                  styleSlug={held.styleSlug}
                  fonts={fonts}
                  savedStyles={savedStyles}
                  // Placeholder text is reached through a `::placeholder` rule,
                  // which a saved style's class cannot cross into.
                  showSavedStyles={slot.key !== "placeholderStyle"}
                  onChange={({ values, styleSlug }) => {
                    const next = { styleSlug, style: styleSlug ? {} : values };
                    if (slot.where === "test") patchTest({ [slot.key]: next } as never);
                    else setSettings((current) => ({ ...current, [slot.key]: next }));
                  }}
                />
              </div>
            </details>
          );
        })}
      </Panel>

      <Panel title={`Questions (${askable})`}>
        {ungraded > 0 ? (
          <p className="help-text">
            {ungraded} {ungraded === 1 ? "question has" : "questions have"} no
            answer key and {ungraded === 1 ? "counts" : "count"} towards
            nothing. That is allowed — a question can be asked without being
            marked — but a test of nothing but these grades zero.
          </p>
        ) : null}

        {test.questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            settings={previewSettings}
            onPatch={(patch) => patchQuestion(question.id, patch)}
            onPatchVariant={(variantId, patch) =>
              patchVariant(question.id, variantId, patch)
            }
            onMove={(direction) => moveQuestion(index, direction)}
            onDelete={() =>
              patchTest({
                questions: test.questions.filter((entry) => entry.id !== question.id),
              })
            }
          />
        ))}

        {askable === 0 ? (
          <p className="admin-subtitle">No questions yet.</p>
        ) : null}

        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "1rem" }}>
          {(["radio", "checkboxGroup", "shortText", "longText"] as FormBlockType[]).map(
            (type) => (
              <button
                key={type}
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  patchTest({ questions: [...test.questions, createTestQuestion(type)] })
                }
              >
                + {TYPE_LABELS[type]}
              </button>
            )
          )}
        </div>
      </Panel>
    </>
  );
}

/** One question: what it is worth, and the ways it can be asked. */
function QuestionCard({
  question,
  index,
  settings,
  onPatch,
  onPatchVariant,
  onMove,
  onDelete,
}: {
  question: TestQuestion;
  index: number;
  settings: FormSettings;
  onPatch: (patch: Partial<TestQuestion>) => void;
  onPatchVariant: (variantId: string, patch: Partial<TestVariant>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <section className="test-question">
      <header className="test-question-head">
        <h3>Question {index + 1}</h3>

        <div className="field is-inline">
          <label htmlFor={`points-${question.id}`}>Worth</label>
          <input
            id={`points-${question.id}`}
            type="number"
            min={0}
            max={100}
            value={question.points}
            onChange={(event) =>
              onPatch({ points: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </div>

        <div className="admin-list-actions">
          <button type="button" className="btn btn-sm" onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" className="btn btn-sm" onClick={() => onMove(1)}>
            ↓
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
            Delete
          </button>
        </div>
      </header>

      {question.variants.length > 1 ? (
        <p className="help-text">
          {question.variants.length} variants — one is drawn each sitting.
        </p>
      ) : null}

      {question.variants.map((variant, variantIndex) => (
        <VariantCard
          key={variant.id}
          variant={variant}
          index={variantIndex}
          only={question.variants.length === 1}
          settings={settings}
          onPatch={(patch) => onPatchVariant(variant.id, patch)}
          onDelete={() =>
            onPatch({
              variants: question.variants.filter((entry) => entry.id !== variant.id),
            })
          }
        />
      ))}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          onPatch({
            // A new variant starts as the same kind of question: variants of
            // one question are alternative wordings, not different questions.
            variants: [
              ...question.variants,
              createTestVariant(question.variants[0].block.type),
            ],
          })
        }
      >
        + Variant
      </button>
    </section>
  );
}

/** One way of asking a question, and what counts as right for it. */
function VariantCard({
  variant,
  index,
  only,
  settings,
  onPatch,
  onDelete,
}: {
  variant: TestVariant;
  index: number;
  /** The last variant cannot be removed — a question has to be asked somehow. */
  only: boolean;
  settings: FormSettings;
  onPatch: (patch: Partial<TestVariant>) => void;
  onDelete: () => void;
}) {
  const { block, key } = variant;
  const kind = keyKindFor(block.type);

  const patchBlock = (patch: Partial<FormBlock>) =>
    onPatch({ block: { ...block, ...patch } });
  const patchKey = (patch: Partial<AnswerKey>) => onPatch({ key: { ...key, ...patch } });

  const hasOptions =
    block.type === "select" || block.type === "radio" || block.type === "checkboxGroup";

  return (
    <details className="inspector-fold is-sub" open={only}>
      <summary>
        {only ? "The question" : `Variant ${index + 1}`}
        <span className="help-text">{block.label || "untitled"}</span>
      </summary>

      <div className="inspector-fold-body">
        <div className="inspector-grid">
          <div className="field">
            <label>Question</label>
            <input
              value={block.label ?? ""}
              onChange={(event) => patchBlock({ label: event.target.value })}
            />
          </div>

          <div className="field">
            <label>Asked as</label>
            <select
              value={block.type}
              onChange={(event) =>
                /*
                 * Changing the type clears the key with it: the right answer
                 * to a radio group is one of its options and the right answer
                 * to a short text is a word, and carrying one over as the
                 * other would leave a key that marks nothing correctly.
                 */
                onPatch({
                  block: { ...block, type: event.target.value as FormBlockType },
                  key: {
                    correctOptions: [],
                    acceptedAnswers: [],
                    matchMode: "exact",
                    caseSensitive: false,
                  },
                })
              }
            >
              {QUESTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type] ?? type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>Help text</label>
          <input
            value={block.helpText ?? ""}
            onChange={(event) => patchBlock({ helpText: event.target.value })}
          />
        </div>

        {hasOptions ? (
          <>
            <div className="field">
              <label>Options (one per line)</label>
              <textarea
                rows={4}
                value={(block.options ?? []).join("\n")}
                onChange={(event) =>
                  patchBlock({
                    options: event.target.value
                      .split("\n")
                      .map((option) => option.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>

            {block.type !== "select" ? (
              <div className="field">
                <label>Options laid out</label>
                <select
                  value={block.optionLayout ?? "column"}
                  onChange={(event) =>
                    patchBlock({ optionLayout: event.target.value as OptionLayout })
                  }
                >
                  {OPTION_LAYOUTS.map((layout) => (
                    <option key={layout} value={layout}>
                      {layout === "column" ? "Down the page" : "Along the line"}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </>
        ) : null}

        {block.type === "file" ? (
          <div className="field">
            <label>Accepted files</label>
            <select
              value={block.uploadKind ?? "any"}
              onChange={(event) => patchBlock({ uploadKind: event.target.value as never })}
            >
              {FILE_UPLOAD_KINDS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <h4 className="inspector-title">The answer</h4>

        {kind === "none" ? (
          <p className="help-text">
            This kind of question cannot be marked automatically. It will be
            asked, and counts towards nothing.
          </p>
        ) : null}

        {kind === "options" && block.type === "checkbox" ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={key.correctOptions.includes("yes")}
              onChange={(event) =>
                patchKey({ correctOptions: event.target.checked ? ["yes"] : [] })
              }
            />
            Correct when ticked
          </label>
        ) : null}

        {kind === "options" && hasOptions ? (
          <>
            {(block.options ?? []).length === 0 ? (
              <p className="help-text">Add some options above first.</p>
            ) : (
              <div className="checkbox-rows is-column">
                {(block.options ?? []).map((option) => (
                  <label key={option} className="checkbox-row">
                    <input
                      type={block.type === "checkboxGroup" ? "checkbox" : "radio"}
                      name={`key-${variant.id}`}
                      checked={key.correctOptions.includes(option)}
                      onChange={() =>
                        patchKey({
                          correctOptions:
                            block.type === "checkboxGroup"
                              ? key.correctOptions.includes(option)
                                ? key.correctOptions.filter((entry) => entry !== option)
                                : [...key.correctOptions, option]
                              : [option],
                        })
                      }
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}
            {block.type === "checkboxGroup" ? (
              <p className="help-text">
                Marked on exactly this set — a half-ticked answer is wrong, not
                partly right.
              </p>
            ) : null}
          </>
        ) : null}

        {kind === "text" ? (
          <>
            <div className="field">
              <label>Accepted answers (one per line)</label>
              <textarea
                rows={3}
                value={key.acceptedAnswers.join("\n")}
                onChange={(event) =>
                  patchKey({
                    acceptedAnswers: event.target.value
                      .split("\n")
                      .map((answer) => answer.trim())
                      .filter(Boolean),
                  })
                }
              />
              <span className="help-text">
                Any one of them counts as right. Leading and trailing space and
                repeated spaces are ignored either way.
              </span>
            </div>

            <div className="inspector-grid">
              <div className="field">
                <label>Matched by</label>
                <select
                  value={key.matchMode}
                  onChange={(event) =>
                    patchKey({ matchMode: event.target.value as never })
                  }
                >
                  {TEXT_MATCH_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === "exact"
                        ? "The whole answer"
                        : "The answer containing it"}
                    </option>
                  ))}
                </select>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={key.caseSensitive}
                  onChange={(event) => patchKey({ caseSensitive: event.target.checked })}
                />
                Capitals matter
              </label>
            </div>
          </>
        ) : null}

        {/* The question as it will be asked. Not a second renderer — the same
            view the public page uses, made inert. */}
        <h4 className="inspector-title">As it is asked</h4>
        <div className="test-question-preview" style={{ pointerEvents: "none" }}>
          <FormFieldView block={block} settings={settings} disabled />
        </div>

        {only ? null : (
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
            Remove this variant
          </button>
        )}
      </div>
    </details>
  );
}
