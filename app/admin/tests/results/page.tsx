import Link from "next/link";

import { AdminHeader, EmptyState } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormDefinition } from "@/lib/models";

import { testResults } from "@/lib/test-results";

export const metadata = { title: "Test results" };

/**
 * Results, one card per test.
 *
 * Its own section rather than a corner of the form inbox, and its own
 * permission with it: a form's answers are whatever it asked for, while a
 * result is a mark against a named person. The two are read by different
 * people for different reasons and are not the same trust.
 *
 * The figure on a card is the average, because that is the question a test
 * answers about itself — how the group did — where a form's is "how many are
 * still to read".
 */
export default async function TestResultsPage() {
  await requirePermission("tests.results");
  await connectDB();

  const [tests, results] = await Promise.all([
    FormDefinition.find({ kind: "test" })
      .select("title status")
      .sort({ title: 1 })
      .lean<any[]>(),
    testResults(),
  ]);

  const cards = tests.map((test) => {
    const rows = results.filter(row => row.formId === String(test._id));
    const graded = rows.filter(row => row.gradingStatus !== "pending");
    return {
      testId: String(test._id),
      title: test.title ?? "",
      status: test.status ?? "draft",
      takers: rows.length,
      attempts: rows.length,
      average: graded.length ? Math.round(graded.reduce((sum, row) => sum + row.grade.percent, 0) / graded.length) : 0,
      pending: rows.length - graded.length,
      graded: graded.length,
      latest: rows[0] ? new Date(rows[0].createdAt).toISOString() : "",
    };
  });

  // The ones people are actually taking first, then alphabetically.
  cards.sort((a, b) => b.takers - a.takers || a.title.localeCompare(b.title));

  return (
    <>
      <AdminHeader
        title="Test results"
        subtitle="Review pending attempts and release grades to participants."
        actions={<a href="/api/admin/tests/export" className="btn btn-primary" download>Export all submissions (CSV)</a>}
      />

      {cards.length === 0 ? (
        <EmptyState
          message="No tests yet."
          actionHref="/admin/forms/new-test"
          actionLabel="Build the first test"
        />
      ) : (
        <ul className="inbox-cards">
          {cards.map((card) => (
            <li key={card.testId}>
              <Link
                href={`/admin/tests/results/${card.testId}`}
                className="inbox-card"
              >
                <span className="inbox-card-title">
                  {card.title}
                  {card.pending > 0 && <span className="badge">{card.pending} pending</span>}
                  {card.status !== "published" ? (
                    <span className="badge">{card.status}</span>
                  ) : null}
                </span>

                <span className="inbox-card-figure">
                  <strong>{card.graded === 0 ? "—" : `${card.average}%`}</strong>
                  <span className="help-text">
                    {card.takers === 0
                      ? "nobody has taken it yet"
                      : `average of ${card.graded} graded ${
                          card.graded === 1 ? "attempt" : "attempts"
                        }`}
                  </span>
                </span>

                <span className="inbox-card-foot">
                  {card.takers === 0
                    ? "Nobody has taken it yet"
                    : `${card.attempts} attempt${
                        card.attempts === 1 ? "" : "s"
                      } · last ${new Date(card.latest).toLocaleDateString()}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
