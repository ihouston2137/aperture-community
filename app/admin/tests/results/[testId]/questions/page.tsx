import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Panel } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeTestSettings } from "@/lib/form-test";
import { FormDefinition } from "@/lib/models";
import { testQuestionReport } from "@/lib/test-question-report";
import { testResults } from "@/lib/test-results";

export const metadata = { title: "Question analysis" };

export default async function TestQuestionReportPage({ params }: { params: Promise<{ testId: string }> }) {
  await requirePermission("tests.results");
  const { testId } = await params;
  if (!/^[a-f\d]{24}$/i.test(testId)) notFound();
  await connectDB();
  const [test, attempts] = await Promise.all([
    FormDefinition.findById(testId).select("title test").lean(),
    testResults({ formId: testId }),
  ]);
  if (!test && !attempts.length) notFound();
  const report = testQuestionReport(normalizeTestSettings(test?.test).questions, attempts);
  const title = test?.title || attempts[0]?.formTitle || "Untitled test";
  return <>
    <nav className="manager-crumbs" aria-label="Breadcrumb">
      <Link href="/admin/tests/results">Test results</Link><span aria-hidden="true">›</span>
      <Link href={`/admin/tests/results/${testId}`}>{title}</Link><span aria-hidden="true">›</span><span>Question analysis</span>
    </nav>
    <AdminHeader title={`${title} — Question analysis`} subtitle={`${report.graded} graded attempts · ${report.pending} pending attempts excluded`}
      actions={<Link href={`/admin/tests/results/${testId}`} className="btn">Results and grading</Link>} />
    <Panel title="Not answered correctly">
      <p className="admin-subtitle">For each question: attempts not fully correct ÷ graded attempts containing that question. Incorrect, unanswered and partially correct answers count as not fully correct. Pending attempts and questions without a recorded grade are excluded.</p>
      <p className="help-text">Each retake counts separately. Variants are combined under their parent question. Highest percentages appear first.</p>
      {report.legacy > 0 && <p className="help-text">Includes {report.legacy} historical result records; each counts once where individual attempt history is unavailable.</p>}
      {report.rows.length ? <div style={{ overflowX: "auto" }}>
        <table className="admin-table question-analysis-table">
          <thead><tr><th scope="col">Question</th><th scope="col">Not fully correct</th><th scope="col">Graded attempts</th><th scope="col">Percent not correct</th></tr></thead>
          <tbody>{report.rows.map(row => <tr key={row.id}>
            <th scope="row">
              <span className="help-text">{row.number === null ? "Previously recorded question" : `Question ${row.number}`}</span>
              <strong>{row.labels[0] || "Untitled question"}</strong>
              {row.labels.length > 1 && <details><summary>Other recorded wording / variants ({row.labels.length - 1})</summary><ul>{row.labels.slice(1).map(label => <li key={label}>{label}</li>)}</ul></details>}
            </th>
            <td>{row.incorrect}</td><td>{row.graded}</td>
            <td>{row.percent === null ? <span className="help-text">No graded attempts</span> : <div className="question-analysis-rate">
              <strong>{row.percent}%</strong>
              <span className="question-analysis-track" aria-hidden="true"><span style={{ width: `${row.percent}%` }} /></span>
            </div>}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="admin-subtitle">No questions or recorded question grades yet.</p>}
    </Panel>
  </>;
}
