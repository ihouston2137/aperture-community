import { gradeSitting, isGradable, type TestGrade, type TestSettings, type SittingRef } from "./form-test";

export type RegradableSubmission = {
  grade: TestGrade;
  gradedBy?: string;
  sitting?: SittingRef[];
  fields?: { id?: string; type?: string; value?: unknown }[];
};

/** Reapply keys only: retain the original paper, point weights, and pass mark. */
export function regradeSubmission(test: TestSettings, submission: RegradableSubmission) {
  let recalculated = 0, preserved = 0, skipped = 0;
  if (!submission.grade.questions?.length) return { grade: submission.grade, recalculated, preserved, skipped: 1 };
  const questions = submission.grade.questions.map(previous => {
    if (previous.gradingSource === "instructor" || previous.expected === "Instructor assessment" ||
      (!previous.gradingSource && submission.gradedBy)) {
      preserved++; return previous;
    }
    const index = submission.sitting?.findIndex(ref => ref.questionId === previous.questionId) ?? -1;
    const ref = index >= 0 ? submission.sitting![index] : undefined;
    const question = test.questions.find(q => q.id === previous.questionId);
    const variant = question?.variants.find(v => v.id === ref?.variantId);
    const field = submission.fields?.[index];
    if (!ref || !question || !variant || !field || !("value" in field) ||
      (previous.type && previous.type !== variant.block.type) || (field.type && field.type !== variant.block.type) ||
      variant.instructorGraded || !isGradable(variant.block, variant.key)) {
      skipped++; return previous;
    }
    const updated = gradeSitting({ ...test, requireReview: false, questions: [{ ...question, points: previous.points }] }, [ref], { [variant.block.id]: field.value }).questions[0];
    if (!updated) { skipped++; return previous; }
    recalculated++;
    return { ...previous, correct: updated.correct, awarded: updated.awarded, expected: updated.expected, gradingSource: "automatic" as const };
  });
  if (!recalculated) return { grade: submission.grade, recalculated, preserved, skipped };
  const scored = questions.reduce((sum, q) => sum + (q.awarded ?? (q.correct ? q.points : 0)), 0);
  const available = questions.reduce((sum, q) => sum + q.points, 0);
  const percent = available ? Math.round(scored / available * 100) : 0;
  const grade: TestGrade = { ...submission.grade, questions, scored, available, percent, right: questions.filter(q => q.correct).length,
    marked: questions.length, passed: submission.grade.passMark > 0 ? percent >= submission.grade.passMark : null };
  return { grade, recalculated, preserved, skipped };
}
