import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTestSettings, createTestQuestion, gradeSitting, reviewedGrade, sittingNeedsReview } from "../lib/form-test";
import { normalizeFormBlock } from "../lib/form-layout";

test("question image limits normalize in pixels without changing legacy widths", () => {
  const block = createTestQuestion().variants[0].block;
  assert.equal(normalizeFormBlock({ ...block, imageMaxWidth: 240.4 })!.imageMaxWidth, 240);
  assert.equal(normalizeFormBlock({ ...block, imageMaxWidth: -1 })!.imageMaxWidth, 0);
  assert.equal(normalizeFormBlock({ ...block, imageMaxWidth: 99999 })!.imageMaxWidth, 8000);
  const legacy = normalizeFormBlock({ ...block, width: 30 })!;
  assert.equal(legacy.width, 30);
  assert.equal(legacy.imageMaxWidth, undefined);
});

test("manual text questions require review only when served and ignore old accepted answers", () => {
  for (const type of ["shortText", "longText"] as const) {
    const question = createTestQuestion(type);
    const variant = question.variants[0];
    variant.instructorGraded = true;
    variant.key.acceptedAnswers = ["Old key"];
    question.variants.push({ ...structuredClone(variant), id: "automatic", instructorGraded: false });
    const settings = normalizeTestSettings({ questions: [question], requireReview: false });
    const sitting = [{ questionId: question.id, variantId: variant.id }];
    assert.equal(sittingNeedsReview(settings, sitting), true);
    assert.equal(sittingNeedsReview(settings, [{ questionId: question.id, variantId: "automatic" }]), false);
    const grade = gradeSitting(settings, sitting, { [variant.block.id]: "Old key" });
    assert.equal(grade.scored, 0);
    assert.equal(grade.available, 1);
    assert.equal(grade.questions[0].expected, "Instructor assessment");
  }
  const radio = createTestQuestion("radio"); radio.variants[0].instructorGraded = true;
  assert.equal(normalizeTestSettings({ questions: [radio] }).questions[0].variants[0].instructorGraded, false);
});

test("review includes manually assessed questions and uses stored points and pass mark", () => {
  const choice = createTestQuestion("radio");
  choice.variants[0].block.options = ["Yes", "No"];
  choice.variants[0].key.correctOptions = ["Yes"];
  const essay = createTestQuestion("longText"); essay.points = 3;
  const settings = normalizeTestSettings({ questions: [choice, essay], requireReview: true, passMark: 75 });
  const sitting = settings.questions.map(q => ({ questionId: q.id, variantId: q.variants[0].id }));
  const grade = gradeSitting(settings, sitting, { [choice.variants[0].block.id]: "Yes", [essay.variants[0].block.id]: "An explanation" });
  assert.equal(grade.questions.length, 2);
  assert.equal(grade.available, 4);
  const reviewed = reviewedGrade(grade, [1, 2]);
  assert.equal(reviewed.percent, 75);
  assert.equal(reviewed.passed, true);
  assert.equal(reviewed.questions[1].awarded, 2);
  assert.equal(reviewedGrade(grade, [0, 2]).passed, false);
  for (const invalid of [[1], [1, 4], [1, -1], [1, null], [1, "2"], [1, NaN]]) assert.throws(() => reviewedGrade(grade, invalid));
  assert.equal(gradeSitting({ ...settings, requireReview: false }, sitting, {}).questions.length, 1);
  assert.equal(normalizeTestSettings({}).requireReview, false);
});

test("nonadjacent checkbox keys are unique, canonical and independent of selection order", () => {
  const question = createTestQuestion("checkboxGroup");
  const variant = question.variants[0];
  variant.block.options = ["First", "Second", "Third", "Fourth", " Third "];
  variant.key.correctOptions = ["Third", " First ", "Third", "Old removed option"];
  const settings = normalizeTestSettings({ questions: [question] });
  const normalized = settings.questions[0].variants[0];
  assert.deepEqual(normalized.block.options, ["First", "Second", "Third", "Fourth"]);
  assert.deepEqual(normalized.key.correctOptions, ["First", "Third"]);
  const sitting = [{ questionId: question.id, variantId: variant.id }];
  for (const answer of [["First", "Third"], ["Third", "First"], [" Third ", "First", "First"]]) {
    const grade = gradeSitting(settings, sitting, { [variant.block.id]: answer });
    assert.equal(grade.percent, 100);
    assert.equal(grade.questions[0].expected, "First, Third");
  }
  for (const answer of [[], ["First"], ["First", "Second", "Third"], ["Second", "Fourth"]]) {
    assert.equal(gradeSitting(settings, sitting, { [variant.block.id]: answer }).percent, 0);
  }
});
