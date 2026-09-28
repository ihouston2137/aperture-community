import type { TestQuestion } from "./form-test";

type QuestionGrade = { questionId?: string; label?: string; correct?: boolean };
export type QuestionReportAttempt = {
  gradingStatus?: string;
  legacy?: boolean;
  grade?: { questions?: QuestionGrade[] };
};

export type QuestionReportRow = {
  id: string;
  number: number | null;
  labels: string[];
  graded: number;
  incorrect: number;
  percent: number | null;
};

/** Count each recorded question at most once per graded sitting, never per point. */
export function testQuestionReport(questions: TestQuestion[], attempts: QuestionReportAttempt[]) {
  const rows = new Map<string, QuestionReportRow>();
  questions.forEach((question, index) => rows.set(question.id, {
    id: question.id, number: index + 1,
    labels: [...new Set(question.variants.map(variant => variant.block.label?.trim()).filter((label): label is string => Boolean(label)))],
    graded: 0, incorrect: 0, percent: null,
  }));
  let pending = 0;
  let graded = 0;
  let legacy = 0;
  for (const attempt of attempts) {
    if (attempt.gradingStatus === "pending") { pending++; continue; }
    graded++;
    if (attempt.legacy) legacy++;
    const seen = new Set<string>();
    for (const question of attempt.grade?.questions ?? []) {
      if (!question.questionId || seen.has(question.questionId) || typeof question.correct !== "boolean") continue;
      seen.add(question.questionId);
      let row = rows.get(question.questionId);
      if (!row) {
        row = { id: question.questionId, number: null, labels: [], graded: 0, incorrect: 0, percent: null };
        rows.set(question.questionId, row);
      }
      const label = question.label?.trim();
      if (label && !row.labels.includes(label)) row.labels.push(label);
      row.graded++;
      if (!question.correct) row.incorrect++;
    }
  }
  for (const row of rows.values()) {
    row.percent = row.graded ? Math.round(row.incorrect / row.graded * 1000) / 10 : null;
  }
  return {
    rows: [...rows.values()].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || (a.number ?? Infinity) - (b.number ?? Infinity)),
    graded, pending, legacy,
  };
}
