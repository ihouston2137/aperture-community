import type { TestGrade } from "./form-test";

type Submission = {
  _id: unknown;
  formId: string;
  formTitle?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  attempts?: number;
  createdAt?: Date | string;
  gradedAt?: Date | string;
  gradedBy?: string;
  gradingStatus?: string;
  legacy?: boolean;
  grade?: TestGrade;
  sitting?: { questionId: string; variantId: string }[];
  fields?: { label?: string; type?: string; value?: unknown }[];
};

function cell(value: unknown): string {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Spreadsheet applications must treat submitted answers as text, not formulas.
  if (typeof value !== "number" && (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
function date(value?: Date | string) {
  return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : "";
}

/** One row per retained attempt, with numbered question columns for mixed tests. */
export function testResultsCsv(submissions: Submission[]): string {
  const count = submissions.reduce((max, row) => Math.max(max, row.fields?.length || 0, row.grade?.questions.length || 0), 0);
  const headers = ["Submission ID", "Test ID", "Test", "User ID", "Name", "Email", "Attempt", "Taken (UTC)", "Status", "Score", "Available points", "Percent", "Pass mark", "Outcome", "Graded (UTC)", "Graded by", "Record"];
  for (let i = 1; i <= count; i++) headers.push(...["Question", "Type", "Answer", "Answer key", "Available points", "Awarded points"].map(label => `Q${i} ${label}`));
  const rows = submissions.map(row => {
    const pending = row.gradingStatus === "pending";
    const grade = row.grade;
    const cells: unknown[] = [String(row._id), row.formId, row.formTitle, row.userId, row.userName, row.userEmail,
      row.attempts ?? 1, date(row.createdAt), pending ? "Pending" : "Graded",
      pending ? "" : grade?.scored, grade?.available, pending ? "" : grade?.percent, grade?.passMark,
      pending ? "Pending" : grade?.passed === true ? "Pass" : grade?.passed === false ? "Fail" : "No pass mark set",
      date(row.gradedAt), row.gradedBy, row.legacy ? "Legacy best result" : "Attempt"];
    for (let i = 0; i < count; i++) {
      const field = row.fields?.[i];
      const question = field
        ? grade?.questions.find(q => row.sitting?.[i]?.questionId ? q.questionId === row.sitting[i].questionId : q.label === field.label)
        : grade?.questions[i];
      cells.push(field?.label ?? question?.label, field?.type ?? question?.type,
        field?.value ?? question?.given, question?.expected, question?.points,
        pending || !question ? "" : question.awarded ?? (question.correct ? question.points : 0));
    }
    return cells.map(cell).join(",");
  });
  return "\uFEFF" + [headers.map(cell).join(","), ...rows].join("\r\n") + "\r\n";
}
