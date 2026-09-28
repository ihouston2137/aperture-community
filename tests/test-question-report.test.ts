import assert from "node:assert/strict";
import test from "node:test";
import { createTestQuestion } from "../lib/form-test";
import { testQuestionReport } from "../lib/test-question-report";

test("denominators use graded sittings containing the question, excluding pending and missing grades", () => {
  const q1 = createTestQuestion(); const q2 = createTestQuestion(); const untouched = createTestQuestion();
  const report = testQuestionReport([q1, q2, untouched], [
    { gradingStatus: "graded", grade: { questions: [{ questionId: q1.id, correct: false }, { questionId: q2.id, correct: true }] } },
    { gradingStatus: "graded", grade: { questions: [{ questionId: q1.id, correct: true }] } },
    { gradingStatus: "graded", grade: { questions: [{ questionId: q2.id, correct: true }] } },
    { gradingStatus: "pending", grade: { questions: [{ questionId: q1.id, correct: false }] } },
    { grade: { questions: [{ questionId: q1.id }] } },
  ]);
  assert.equal(report.pending, 1);
  assert.equal(report.rows.find(row => row.id === q1.id)!.percent, 50);
  assert.equal(report.rows.find(row => row.id === q1.id)!.graded, 2);
  assert.equal(report.rows.find(row => row.id === q2.id)!.percent, 0);
  assert.equal(report.rows.find(row => row.id === untouched.id)!.percent, null);
});

test("variants combine by identity, historical questions survive and duplicate entries count once", () => {
  const q = createTestQuestion(); q.variants[0].block.label = "Current wording";
  const report = testQuestionReport([q], [
    { legacy: true, grade: { questions: [{ questionId: q.id, label: "Variant A", correct: false }, { questionId: q.id, correct: false }, { questionId: "removed", label: "Old question", correct: false }] } },
    { grade: { questions: [{ questionId: q.id, label: "Variant B", correct: true }] } },
    { grade: { questions: [{ questionId: q.id, correct: true }] } },
  ]);
  assert.equal(report.legacy, 1);
  assert.equal(report.rows[0].id, "removed");
  assert.equal(report.rows[0].percent, 100);
  assert.equal(report.rows[0].number, null);
  assert.equal(report.rows[1].graded, 3);
  assert.equal(report.rows[1].percent, 33.3);
  assert.deepEqual(report.rows[1].labels, ["Current wording", "Variant A", "Variant B"]);
});
