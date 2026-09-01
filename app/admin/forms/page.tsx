import Link from "next/link";

import { AdminHeader, EmptyState, StatusBadge } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormDefinition, FormSubmission } from "@/lib/models";

import { deleteFormAction } from "./actions";

export const metadata = { title: "Forms" };

export default async function FormsPage() {
  await requirePermission("forms.manage");
  await connectDB();

  const forms = await FormDefinition.find().sort({ updatedAt: -1 }).lean<any[]>();
  const counts = await Promise.all(
    forms.map((form) => FormSubmission.countDocuments({ formId: String(form._id) }))
  );

  return (
    <>
      <AdminHeader
        title="Forms"
        subtitle="Forms built with the same row and column model as pages. A test is a form with an answer key."
        actions={
          <>
            <Link href="/admin/forms/new" className="btn btn-primary">
              New form
            </Link>
            <Link href="/admin/forms/new-test" className="btn">
              New test
            </Link>
          </>
        }
      />

      {forms.length === 0 ? (
        <EmptyState
          message="No forms yet."
          actionHref="/admin/forms/new"
          actionLabel="Build the first form"
        />
      ) : (
        <ul className="admin-list">
          {forms.map((form, index) => (
            <li key={String(form._id)} className="admin-list-item">
              <div>
                <h3>
                  {form.title}
                  {form.kind === "test" ? (
                    <span className="badge" style={{ marginLeft: "0.5rem" }}>
                      test
                    </span>
                  ) : null}
                </h3>
                <div className="admin-list-meta">
                  {form.kind === "test" ? "/test/" : "/forms/"}
                  {form.slug} · {counts[index]}{" "}
                  {form.kind === "test"
                    ? counts[index] === 1
                      ? "result"
                      : "results"
                    : counts[index] === 1
                      ? "submission"
                      : "submissions"}
                </div>
              </div>
              <StatusBadge status={form.status} />
              <div className="admin-list-actions">
                <Link
                  className="btn btn-sm"
                  href={
                    form.kind === "test"
                      ? `/admin/forms/${form._id}/test`
                      : `/admin/forms/${form._id}/edit`
                  }
                >
                  Edit
                </Link>
                <Link
                  className="btn btn-sm"
                  href={`/admin/forms/${form._id}/submission-layout`}
                >
                  Submission layout
                </Link>
                <Link
                  className="btn btn-sm"
                  href={
                    form.kind === "test"
                      ? `/test/${form.slug}`
                      : `/forms/${form.slug}`
                  }
                  target="_blank"
                >
                  View
                </Link>
                <form action={deleteFormAction}>
                  <input type="hidden" name="id" value={String(form._id)} />
                  <button type="submit" className="btn btn-danger btn-sm">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
