import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { collectFormFields, normalizeFormLayout } from "@/lib/form-layout";
import { FormDefinition, FormSubmission } from "@/lib/models";

import {
  SubmissionsList,
  type FormSummary,
  type SubmissionRecord,
} from "../submissions-list";

export const metadata = { title: "Form submissions" };

/** Ids off a stored list that may hold either bare strings or `{ id }`. */
function idsOf(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).map((entry: any) => String(entry?.id ?? entry));
}

export default async function FormSubmissionsPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  await requirePermission("forms.submissions");
  const { formId } = await params;

  await connectDB();

  const [form, submissions] = await Promise.all([
    // A deleted form is not an error here: its submissions outlive it, and the
    // inbox still lists them under the title they were taken with.
    FormDefinition.findById(formId)
      .select("title layout submissionLayout submissionColumns")
      .lean<any>()
      .catch(() => null),
    FormSubmission.find({ formId }).sort({ createdAt: -1 }).limit(500).lean<any[]>(),
  ]);

  if (!form && submissions.length === 0) notFound();

  const fields = form ? collectFormFields(normalizeFormLayout(form.layout)) : [];
  const chosen = idsOf(form?.submissionColumns);

  /*
   * Unconfigured forms list their first three fields.
   *
   * Column labels come from the form rather than from a submission, so a
   * header reads the same on every row — and still reads for a field renamed
   * since, or one nobody has answered yet.
   */
  const columnIds = chosen.length > 0 ? chosen : fields.slice(0, 3).map((field) => field.id);

  const summary: FormSummary = {
    _id: formId,
    title: form?.title ?? submissions[0]?.formTitle ?? "Untitled form",
    columns: columnIds
      .map((id) => fields.find((field) => field.id === id))
      .filter(Boolean)
      .map((field) => ({ id: field!.id, label: field!.label || field!.name || field!.id })),
    layoutOrder: idsOf(form?.submissionLayout),
  };

  const records: SubmissionRecord[] = submissions.map((submission) => ({
    _id: String(submission._id),
    formId: String(submission.formId),
    formTitle: submission.formTitle ?? summary.title,
    status: submission.status ?? "new",
    createdAt: new Date(submission.createdAt).toISOString(),
    fields: (submission.fields ?? []).map((field: any) => ({
      id: String(field.id ?? field.name ?? ""),
      name: field.name,
      label: field.label,
      type: field.type,
      value: field.value,
    })),
  }));

  return (
    <>
      <nav className="manager-crumbs" aria-label="Breadcrumb">
        <Link href="/admin/forms/submissions">Form submissions</Link>
        <span aria-hidden="true">›</span>
        <span>{summary.title}</span>
      </nav>

      <AdminHeader
        title={summary.title}
        subtitle="Newest first. Open a row to read the whole entry."
        actions={
          form ? (
            <Link
              href={`/admin/forms/${formId}/submission-layout`}
              className="btn btn-sm"
            >
              Choose columns
            </Link>
          ) : null
        }
      />

      <SubmissionsList form={summary} submissions={records} />
    </>
  );
}
