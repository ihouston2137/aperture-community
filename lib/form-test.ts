/**
 * Tests: a form with an answer key.
 *
 * A test is not a second kind of form so much as a form that knows what the
 * right answers are. It reuses the field blocks, the renderer, the styles and
 * the submission pipeline whole — what it adds is a key to mark against, a way
 * of not being the same paper twice, and a grade at the end.
 *
 * It does *not* reuse the page layout. A test is a list of questions and one
 * follows another, so the rows are built here rather than arranged by hand:
 * asking somebody to lay out a forty-question paper by dragging columns is
 * asking them to do work the shape of the thing already decides.
 *
 * Pure and client-safe, like the rest of the form vocabulary.
 */

import {
  createFormBlock,
  isFieldBlock,
  normalizeFormBlock,
  type FormBlock,
  type FormBlockType,
} from "./form-layout";
import {
  emptyStyleSlot,
  normalizeStyleSlot,
  type StyleSlot,
} from "./display-templates";
import {
  createColumn,
  createRow,
  makeId,
  NEW_CONTAINER_PADDING,
  type PageRow,
} from "./page-layout";

/* ------------------------------------------------------------------ Types */

/** What the person taking the test is shown once it is sent. */
export const TEST_RESULT_MODES = ["score", "review", "silent"] as const;
export type TestResultMode = (typeof TEST_RESULT_MODES)[number];

export const TEST_RESULT_LABELS: Record<TestResultMode, string> = {
  score: "Their percentage",
  review: "Percentage, and which they got wrong",
  silent: "Nothing — the grade is recorded only",
};

/** How a typed answer is compared with the key. */
export const TEXT_MATCH_MODES = ["exact", "contains"] as const;
export type TextMatchMode = (typeof TEXT_MATCH_MODES)[number];

/**
 * Which block types can be marked.
 *
 * A file upload and a hidden value are still allowed as questions — a test can
 * ask for a photograph — they simply carry no key and count towards nothing.
 */
export const GRADABLE_TYPES: FormBlockType[] = [
  "shortText",
  "longText",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
  "checkboxGroup",
];

/** What a question type asks of its key. */
export function keyKindFor(type: FormBlockType): "options" | "text" | "none" {
  if (type === "select" || type === "radio" || type === "checkboxGroup") return "options";
  if (type === "checkbox") return "options";
  if (GRADABLE_TYPES.includes(type)) return "text";
  return "none";
}

export type AnswerKey = {
  /**
   * The options that count as right.
   *
   * For a radio or a dropdown, any one of them. For a checkbox group, exactly
   * this set — a half-ticked answer to "which three of these" is not a
   * different right answer, it is a wrong one. For a single checkbox, holding
   * "yes" means it must be ticked and holding nothing means it must not be.
   */
  correctOptions: string[];
  /** Any one of these counts as right, for a typed answer. */
  acceptedAnswers: string[];
  matchMode: TextMatchMode;
  caseSensitive: boolean;
};

export const emptyAnswerKey: AnswerKey = {
  correctOptions: [],
  acceptedAnswers: [],
  matchMode: "exact",
  caseSensitive: false,
};

/**
 * One way of asking one question.
 *
 * A variant carries its own wording, its own options and its own key, because
 * changing the question changes the answer — two variants of "which of these
 * is fastest" with different lists do not share a right answer.
 */
export type TestVariant = {
  id: string;
  block: FormBlock;
  key: AnswerKey;
};

export type TestQuestion = {
  id: string;
  /** What it is worth. Ungradable questions are worth nothing whatever this says. */
  points: number;
  /** At least one. Several means one is drawn per sitting. */
  variants: TestVariant[];
};

export type TestSettings = {
  questions: TestQuestion[];
  /**
   * What to do before starting, said at the top of the paper.
   *
   * Its own field rather than a text block among the questions: it is read
   * before the test begins and is not part of what is marked, and a candidate
   * scrolling back to check the rules should not have to hunt for them among
   * the questions.
   */
  instructions: string;
  /**
   * How many times one person may sit it. Zero is as often as they like.
   *
   * Counted per person rather than per sitting, which is why the taker is
   * recorded — a limit nobody is identified against is not a limit.
   */
  attemptLimit: number;
  /**
   * The lowest percentage that passes. Zero means the test does not pass or
   * fail anybody — it just reports a mark.
   *
   * A minimum rather than a boundary to be above: set to 70, seventy passes.
   * Somebody told "you need 70%" and given 70% has passed, and a rule that
   * disagreed with the sentence describing it would be the wrong rule.
   */
  passMark: number;
  /** The title and the instructions, each dressed on their own. */
  titleStyle: StyleSlot;
  instructionsStyle: StyleSlot;
  /**
   * How many questions a sitting asks. Zero asks all of them.
   *
   * Drawing ten from twenty-five is the cheapest way to make two sittings
   * different papers, and it grades out of ten either way — the denominator is
   * what was asked, never what was written.
   */
  askCount: number;
  shuffleQuestions: boolean;
  /** Shuffles the choices inside a question, not the questions themselves. */
  shuffleOptions: boolean;
  resultMode: TestResultMode;
};

export const defaultTestSettings: TestSettings = {
  questions: [],
  instructions: "",
  attemptLimit: 0,
  passMark: 0,
  titleStyle: emptyStyleSlot,
  instructionsStyle: emptyStyleSlot,
  askCount: 0,
  shuffleQuestions: false,
  shuffleOptions: false,
  resultMode: "score",
};

/* ---------------------------------------------------------- Normalization */

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => str(entry)).filter(Boolean).slice(0, 100);
}

export function normalizeAnswerKey(input: unknown): AnswerKey {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    correctOptions: stringList(raw.correctOptions),
    acceptedAnswers: stringList(raw.acceptedAnswers),
    matchMode: TEXT_MATCH_MODES.includes(raw.matchMode as TextMatchMode)
      ? (raw.matchMode as TextMatchMode)
      : "exact",
    caseSensitive: Boolean(raw.caseSensitive),
  };
}

export function normalizeTestVariant(input: unknown): TestVariant | null {
  const raw = (input ?? {}) as Record<string, unknown>;
  const block = normalizeFormBlock(raw.block);
  // A variant with no question in it is not a variant, and a page block is not
  // something anybody can answer.
  if (!block || !isFieldBlock(block.type) || block.type === "submit") return null;

  return {
    id: str(raw.id) || makeId("variant"),
    block,
    key: normalizeAnswerKey(raw.key),
  };
}

export function normalizeTestQuestion(input: unknown): TestQuestion | null {
  const raw = (input ?? {}) as Record<string, unknown>;

  const variants: TestVariant[] = [];
  if (Array.isArray(raw.variants)) {
    for (const entry of raw.variants) {
      const variant = normalizeTestVariant(entry);
      if (variant) variants.push(variant);
    }
  }
  if (variants.length === 0) return null;

  return {
    id: str(raw.id) || makeId("question"),
    points: Math.max(0, Math.min(100, num(raw.points, 1))),
    variants,
  };
}

export function normalizeTestSettings(input: unknown): TestSettings {
  const raw = (input ?? {}) as Record<string, unknown>;

  const questions: TestQuestion[] = [];
  if (Array.isArray(raw.questions)) {
    for (const entry of raw.questions) {
      const question = normalizeTestQuestion(entry);
      if (question) questions.push(question);
    }
  }

  return {
    questions,
    instructions: str(raw.instructions).slice(0, 4000),
    // Bounded: a limit of a thousand is not a limit, and a negative one is a
    // test nobody may sit.
    attemptLimit: Math.max(0, Math.min(50, Math.round(num(raw.attemptLimit, 0)))),
    passMark: Math.max(0, Math.min(100, Math.round(num(raw.passMark, 0)))),
    titleStyle: normalizeStyleSlot(raw.titleStyle),
    instructionsStyle: normalizeStyleSlot(raw.instructionsStyle),
    askCount: Math.max(0, Math.min(questions.length, num(raw.askCount, 0))),
    shuffleQuestions: Boolean(raw.shuffleQuestions),
    shuffleOptions: Boolean(raw.shuffleOptions),
    resultMode: TEST_RESULT_MODES.includes(raw.resultMode as TestResultMode)
      ? (raw.resultMode as TestResultMode)
      : "score",
  };
}

/* --------------------------------------------------------------- Authoring */

export function createTestVariant(type: FormBlockType = "radio"): TestVariant {
  return {
    id: makeId("variant"),
    block: createFormBlock(type),
    key: { ...emptyAnswerKey },
  };
}

export function createTestQuestion(type: FormBlockType = "radio"): TestQuestion {
  return { id: makeId("question"), points: 1, variants: [createTestVariant(type)] };
}

/* ---------------------------------------------------------------- Delivery */

/** One question as actually served, and which variant of it was drawn. */
export type ServedQuestion = {
  questionId: string;
  variantId: string;
  points: number;
  block: FormBlock;
};

/** What the submission sends back so the marking knows which paper it was. */
export type SittingRef = { questionId: string; variantId: string };

function shuffled<T>(list: T[], random: () => number): T[] {
  const next = [...list];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

/**
 * Draw one sitting of a test.
 *
 * The three ways of varying it compose: a pool is drawn from, a variant is
 * picked for each question drawn, and the order of both questions and choices
 * can be shuffled. A test using none of them is the same paper every time,
 * which is a perfectly good test.
 */
export function buildSitting(
  test: TestSettings,
  random: () => number = Math.random
): ServedQuestion[] {
  const pool =
    test.askCount > 0 && test.askCount < test.questions.length
      ? shuffled(test.questions, random).slice(0, test.askCount)
      : test.questions;

  // Drawing from the pool has already lost the authored order, so it is put
  // back unless shuffling was asked for — a test drawn from a pool should
  // still read in the order its questions were written.
  const ordered = test.shuffleQuestions
    ? shuffled(pool, random)
    : test.questions.filter((question) => pool.includes(question));

  return ordered.map((question) => {
    const variant =
      question.variants.length === 1
        ? question.variants[0]
        : question.variants[Math.floor(random() * question.variants.length)];

    const block =
      test.shuffleOptions && variant.block.options?.length
        ? { ...variant.block, options: shuffled(variant.block.options, random) }
        : variant.block;

    return {
      questionId: question.id,
      variantId: variant.id,
      points: question.points,
      block,
    };
  });
}

/**
 * A sitting as rows the form renderer already understands.
 *
 * One question to a row, one column to a question. Everything downstream — the
 * styles, the field views, the submission — then works on a test exactly as it
 * works on a form, with no second renderer to keep in step.
 */
export function sittingLayout(served: ServedQuestion[], submitLabel = "Submit"): PageRow[] {
  const rows = served.map((question) => {
    const row = createRow(1, NEW_CONTAINER_PADDING);
    row.columns[0].blocks = [question.block as never];
    return row;
  });

  const submit = createFormBlock("submit");
  submit.label = submitLabel;
  const submitRow = createRow(1, NEW_CONTAINER_PADDING);
  submitRow.columns[0].blocks = [submit as never];

  return [...rows, submitRow];
}

/* ---------------------------------------------------------------- Marking */

/** Whether this question can be marked at all. */
export function isGradable(block: FormBlock, key: AnswerKey): boolean {
  const kind = keyKindFor(block.type);
  if (kind === "none") return false;
  if (kind === "options") {
    // A single checkbox is always markable: an empty key means "must be left
    // unticked", which is a real answer rather than a missing one.
    return block.type === "checkbox" || key.correctOptions.length > 0;
  }
  return key.acceptedAnswers.length > 0;
}

function tidy(value: string, caseSensitive: boolean): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function textIsRight(answer: unknown, key: AnswerKey): boolean {
  const given = tidy(String(answer ?? ""), key.caseSensitive);
  if (!given) return false;

  return key.acceptedAnswers.some((accepted) => {
    const want = tidy(accepted, key.caseSensitive);
    if (!want) return false;
    return key.matchMode === "contains" ? given.includes(want) : given === want;
  });
}

function optionsAreRight(block: FormBlock, answer: unknown, key: AnswerKey): boolean {
  if (block.type === "checkbox") {
    const ticked = String(answer ?? "") === "yes";
    return ticked === key.correctOptions.includes("yes");
  }

  if (block.type === "checkboxGroup") {
    // Exactly the right set: a half-ticked answer to "which three of these"
    // is not a different right answer, it is a wrong one.
    const given = new Set((Array.isArray(answer) ? answer : []).map(String));
    const want = new Set(key.correctOptions);
    if (given.size !== want.size) return false;
    for (const option of want) if (!given.has(option)) return false;
    return true;
  }

  return key.correctOptions.includes(String(answer ?? ""));
}

export type MarkedQuestion = {
  questionId: string;
  /** The question as it was asked, so a review reads back the paper given. */
  label: string;
  points: number;
  correct: boolean;
  /** Only filled in for the review mode. */
  given?: string;
  expected?: string;
};

export type TestGrade = {
  /** Points scored and points available. Ungraded questions are in neither. */
  scored: number;
  available: number;
  percent: number;
  /**
   * The mark this sitting was judged against, and whether it made it.
   *
   * Both recorded rather than worked out when the result is read, for the same
   * reason the grade itself is: the threshold can be changed afterwards, and a
   * pass that quietly becomes a fail because somebody raised the bar in March
   * is not a record of what happened in February.
   *
   * `passMark` of zero means the test passes nobody and fails nobody, and
   * `passed` is null there rather than false — "no such judgement" and "did
   * not pass" are different things to show.
   */
  passMark: number;
  passed: boolean | null;
  /** Questions right, and questions marked — headcounts, not points. */
  right: number;
  marked: number;
  questions: MarkedQuestion[];
};

function readable(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value ?? "");
}

/**
 * Mark one sitting.
 *
 * The denominator is what was asked and could be marked — not what the test
 * holds. A pool of twenty-five asked as ten is out of ten, and a question with
 * no key set is out of nothing rather than wrong.
 */
export function gradeSitting(
  test: TestSettings,
  sitting: SittingRef[],
  answers: Record<string, unknown>
): TestGrade {
  const questions: MarkedQuestion[] = [];
  let scored = 0;
  let available = 0;
  let right = 0;
  let marked = 0;

  for (const ref of sitting) {
    const question = test.questions.find((entry) => entry.id === ref.questionId);
    const variant = question?.variants.find((entry) => entry.id === ref.variantId);
    if (!question || !variant) continue;

    const { block, key } = variant;
    if (!isGradable(block, key)) continue;

    const answer = answers[block.id];
    const isRight =
      keyKindFor(block.type) === "options"
        ? optionsAreRight(block, answer, key)
        : textIsRight(answer, key);

    available += question.points;
    marked += 1;
    if (isRight) {
      scored += question.points;
      right += 1;
    }

    questions.push({
      questionId: question.id,
      label: block.label || block.name || "",
      points: question.points,
      correct: isRight,
      given: readable(answer),
      expected:
        keyKindFor(block.type) === "options"
          ? block.type === "checkbox"
            ? key.correctOptions.includes("yes")
              ? "ticked"
              : "not ticked"
            : key.correctOptions.join(", ")
          : key.acceptedAnswers.join(" / "),
    });
  }

  // A test with nothing markable scores nothing rather than dividing by zero.
  const percent = available > 0 ? Math.round((scored / available) * 100) : 0;

  return {
    scored,
    available,
    percent,
    passMark: test.passMark,
    // At or above, not above: somebody told "you need 70%" and given 70% has
    // passed. A test with no mark set judges nobody.
    passed: test.passMark > 0 ? percent >= test.passMark : null,
    right,
    marked,
    questions,
  };
}

/** Strips a grade down to what the taker is allowed to see. */
export function gradeForTaker(grade: TestGrade, mode: TestResultMode): TestGrade | null {
  if (mode === "silent") return null;
  if (mode === "score") return { ...grade, questions: [] };
  return grade;
}
