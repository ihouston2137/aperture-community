import test from "node:test";
import assert from "node:assert/strict";
import { testResultsCsv } from "../lib/test-results-csv";

function parse(csv: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && ch === ",") { row.push(value); value = ""; }
    else if (!quoted && ch === "\r" && text[i + 1] === "\n") { row.push(value); rows.push(row); row = []; value = ""; i++; }
    else value += ch;
  }
  return rows;
}

test("CSV preserves answers and Unicode, prevents formulas, and distinguishes pending scores", () => {
  const submission = {
    _id: "attempt", formId: "test", formTitle: 'A "test", café', userName: "=1+1", createdAt: "2026-09-22T12:00:00Z", gradingStatus: "graded",
    sitting: [{ questionId: "q", variantId: "v" }], fields: [{ label: "Explain", type: "longText", value: 'Line 1, "quoted"\nLine 2' }],
    grade: { scored: 2, available: 3, percent: 67, passMark: 60, passed: true, right: 0, marked: 1,
      questions: [{ questionId: "q", label: "Explain", points: 3, awarded: 2, correct: false, expected: "Instructor assessment" }] },
  };
  const rows = parse(testResultsCsv([submission, { ...submission, _id: "pending", gradingStatus: "pending", fields: [{ label: "Explain", type: "longText", value: "  @SUM(A1:A5)" }] }]));
  const get = (row: number, column: string) => rows[row][rows[0].indexOf(column)];
  assert.equal(get(1, "Test"), submission.formTitle);
  assert.equal(get(1, "Name"), "'=1+1");
  assert.equal(get(1, "Q1 Answer"), submission.fields[0].value);
  assert.equal(get(1, "Q1 Awarded points"), "2");
  assert.equal(get(1, "Outcome"), "Pass");
  assert.equal(get(2, "Q1 Answer"), "'  @SUM(A1:A5)");
  for (const field of ["Score", "Percent", "Q1 Awarded points"]) assert.equal(get(2, field), "");
  assert.equal(get(2, "Status"), "Pending");
  assert.ok(rows.every(row => row.length === rows[0].length));
  assert.equal(parse(testResultsCsv([])).length, 1);
});
