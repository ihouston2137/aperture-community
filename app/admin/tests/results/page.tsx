import Link from "next/link";

import { AdminHeader, EmptyState } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormDefinition, FormSubmission } from "@/lib/models";

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

  const [tests, grouped] = await Promise.all([
    FormDefinition.find({ kind: "test" })
      .select("title status")
      .sort({ title: 1 })
      .lean<any[]>(),
    FormSubmission.aggregate([
      { $match: { grade: { $exists: true } } },
      {
        $group: {
          _id: "$formId",
          takers: { $sum: 1 },
          attempts: { $sum: { $ifNull: ["$attempts", 1] } },
          average: { $avg: "$grade.percent" },
          latest: { $max: "$createdAt" },
        },
      },
    ]),
  ]);

  const counts = new Map<string, any>(
    grouped.map((entry: any) => [String(entry._id), entry])
  );

  const cards = tests.map((test) => {
    const found = counts.get(String(test._id));
    return {
      testId: String(test._id),
      title: test.title ?? "",
      status: test.status ?? "draft",
      takers: found?.takers ?? 0,
      attempts: found?.attempts ?? 0,
      average: found?.average ? Math.round(found.average) : 0,
      latest: found?.latest ? new Date(found.latest).toISOString() : "",
    };
  });

  // The ones people are actually taking first, then alphabetically.
  cards.sort((a, b) => b.takers - a.takers || a.title.localeCompare(b.title));

  return (
    <>
      <AdminHeader
        title="Test results"
        subtitle="One card per test. Each person's best result is the one kept."
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
                  {card.status !== "published" ? (
                    <span className="badge">{card.status}</span>
                  ) : null}
                </span>

                <span className="inbox-card-figure">
                  <strong>{card.takers === 0 ? "—" : `${card.average}%`}</strong>
                  <span className="help-text">
                    {card.takers === 0
                      ? "nobody has taken it yet"
                      : `average of ${card.takers} ${
                          card.takers === 1 ? "person" : "people"
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
