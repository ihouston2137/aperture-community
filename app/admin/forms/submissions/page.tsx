import Link from "next/link";

import { AdminHeader, EmptyState } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormDefinition, FormSubmission } from "@/lib/models";

export const metadata = { title: "Form submissions" };

type InboxCard = {
  formId: string;
  title: string;
  /** Still to be looked at. */
  unread: number;
  total: number;
  /** When the most recent one arrived, or empty for a form with none. */
  latest: string;
  /** The form itself is gone; the submissions it took are not. */
  orphaned: boolean;
};

/**
 * The submissions inbox, one card per form.
 *
 * A single list of everything answers the wrong question. What is wanted on
 * arriving here is "is there anything to deal with, and where" — a number per
 * form — and only then the entries themselves. So the count leads and the list
 * is a click away, per form, where the columns can be that form's own.
 */
export default async function SubmissionsPage() {
  await requirePermission("forms.submissions");
  await connectDB();

  const [forms, grouped] = await Promise.all([
    FormDefinition.find().select("title").sort({ title: 1 }).lean<any[]>(),
    FormSubmission.aggregate([
      {
        $group: {
          _id: "$formId",
          title: { $last: "$formTitle" },
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } },
          latest: { $max: "$createdAt" },
        },
      },
    ]),
  ]);

  const counts = new Map<string, any>(
    grouped.map((entry: any) => [String(entry._id), entry])
  );

  const cards: InboxCard[] = forms.map((form) => {
    const found = counts.get(String(form._id));
    return {
      formId: String(form._id),
      title: form.title ?? "",
      unread: found?.unread ?? 0,
      total: found?.total ?? 0,
      latest: found?.latest ? new Date(found.latest).toISOString() : "",
      orphaned: false,
    };
  });

  // A deleted form leaves its submissions behind, and those still have to be
  // reachable — the answers people gave did not stop mattering because the
  // form asking for them was taken down.
  for (const [formId, entry] of counts) {
    if (forms.some((form) => String(form._id) === formId)) continue;
    cards.push({
      formId,
      title: entry.title || "Untitled form",
      unread: entry.unread ?? 0,
      total: entry.total ?? 0,
      latest: entry.latest ? new Date(entry.latest).toISOString() : "",
      orphaned: true,
    });
  }

  // Anything waiting first, then the busiest, then alphabetically. A form with
  // nothing unread is not urgent however many it has taken overall.
  cards.sort(
    (a, b) =>
      b.unread - a.unread || b.total - a.total || a.title.localeCompare(b.title)
  );

  const waiting = cards.reduce((sum, card) => sum + card.unread, 0);

  return (
    <>
      <AdminHeader
        title="Form submissions"
        subtitle={
          waiting === 0
            ? "Nothing waiting to be read."
            : `${waiting} submission${waiting === 1 ? "" : "s"} still to read.`
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          message="No forms yet."
          actionHref="/admin/forms/new"
          actionLabel="Build the first form"
        />
      ) : (
        <ul className="inbox-cards">
          {cards.map((card) => (
            <li key={card.formId}>
              <Link
                href={`/admin/forms/submissions/${card.formId}`}
                className={`inbox-card${card.unread > 0 ? " is-waiting" : ""}`}
              >
                <span className="inbox-card-title">
                  {card.title}
                  {card.orphaned ? (
                    <span className="badge">form deleted</span>
                  ) : null}
                </span>

                {/* The unread count is the reason to open this card, so it is
                    the figure; the total is what it is out of. */}
                <span className="inbox-card-figure">
                  <strong>{card.unread}</strong>
                  <span className="help-text">
                    unread of {card.total}{" "}
                    {card.total === 1 ? "submission" : "submissions"}
                  </span>
                </span>

                <span className="inbox-card-foot">
                  {card.latest
                    ? `Last received ${new Date(card.latest).toLocaleDateString()}`
                    : "Nothing received yet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
