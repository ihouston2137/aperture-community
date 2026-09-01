import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormDefinition, FormSubmission } from "@/lib/models";

import { TestResultsList, type ResultRecord } from "./results-list";

export const metadata = { title: "Test results" };

/**
 * Sort key for a person's name, last first.
 *
 * A results list is read down the surnames, so that is what it is ordered and
 * shown by. Built from the stored display name rather than from the account,
 * so somebody since removed still sorts where they belong.
 */
function surnameFirst(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  const last = parts[parts.length - 1];
  return `${last}, ${parts.slice(0, -1).join(" ")}`;
}

export default async function TestResultPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  await requirePermission("tests.results");
  const { testId } = await params;

  await connectDB();

  const [test, submissions] = await Promise.all([
    FormDefinition.findById(testId)
      .select("title kind test submissionLayout")
      .lean<any>()
      .catch(() => null),
    FormSubmission.find({ formId: testId, grade: { $exists: true } })
      .limit(1000)
      .lean<any[]>(),
  ]);

  if (!test && submissions.length === 0) notFound();

  const records: ResultRecord[] = submissions.map((submission) => {
    const name = String(submission.userName ?? "").trim();
    return {
      _id: String(submission._id),
      // A sitting from before takers were recorded has no name to show, and
      // saying so is better than showing an empty cell.
      name: name ? surnameFirst(name) : "Not recorded",
      attempts: submission.attempts ?? 1,
      percent: submission.grade?.percent ?? 0,
      passMark: submission.grade?.passMark ?? 0,
      // A sitting recorded before the threshold existed was judged by nothing,
      // which is what `null` says.
      passed:
        typeof submission.grade?.passed === "boolean"
          ? submission.grade.passed
          : null,
      scored: submission.grade?.scored ?? 0,
      available: submission.grade?.available ?? 0,
      right: submission.grade?.right ?? 0,
      marked: submission.grade?.marked ?? 0,
      takenAt: new Date(submission.createdAt).toISOString(),
      questions: JSON.parse(JSON.stringify(submission.grade?.questions ?? [])),
    };
  });

  // Down the surnames, which is how a register of results is read.
  records.sort((a, b) => a.name.localeCompare(b.name));

  const average =
    records.length === 0
      ? 0
      : Math.round(
          records.reduce((total, row) => total + row.percent, 0) / records.length
        );

  // Only those actually judged: a sitting from before the threshold was set is
  // neither a pass nor a fail, and counting it as either would be a made-up
  // number in the one place the figures have to be trusted.
  const judged = records.filter((row) => row.passed !== null);
  const passes = judged.filter((row) => row.passed).length;

  return (
    <>
      <nav className="manager-crumbs" aria-label="Breadcrumb">
        <Link href="/admin/tests/results">Test results</Link>
        <span aria-hidden="true">›</span>
        <span>{test?.title ?? "Untitled test"}</span>
      </nav>

      <AdminHeader
        title={test?.title ?? "Untitled test"}
        subtitle={
          records.length === 0
            ? "Nobody has sat this yet."
            : `${records.length} ${
                records.length === 1 ? "person" : "people"
              } · ${average}% average${
                judged.length > 0 ? ` · ${passes} of ${judged.length} passed` : ""
              } · each person's best sitting`
        }
        actions={
          test ? (
            <Link href={`/admin/forms/${testId}/test`} className="btn btn-sm">
              Edit the test
            </Link>
          ) : null
        }
      />

      <TestResultsList records={records} />
    </>
  );
}
