import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormDefinition, FormSubmission } from "@/lib/models";

import { SubmissionsList, type SubmissionRecord } from "./submissions-list";

export const metadata = { title: "Form submissions" };

export default async function SubmissionsPage() {
  await requirePermission("forms.submissions");
  await connectDB();

  const [submissions, forms] = await Promise.all([
    FormSubmission.find().sort({ createdAt: -1 }).limit(500).lean<any[]>(),
    FormDefinition.find().select("title submissionLayout").sort({ title: 1 }).lean<any[]>(),
  ]);

  const layoutByForm = new Map<string, string[]>(
    forms.map((form) => [
      String(form._id),
      (Array.isArray(form.submissionLayout) ? form.submissionLayout : []).map((entry: any) =>
        String(entry?.id ?? entry)
      ),
    ])
  );

  const records: SubmissionRecord[] = submissions.map((submission) => ({
    _id: String(submission._id),
    formId: String(submission.formId),
    formTitle: submission.formTitle ?? "",
    status: submission.status ?? "new",
    createdAt: new Date(submission.createdAt).toISOString(),
    fields: (submission.fields ?? []).map((field: any) => ({
      id: String(field.id ?? field.name ?? ""),
      name: field.name,
      label: field.label,
      type: field.type,
      value: field.value,
    })),
    layoutOrder: layoutByForm.get(String(submission.formId)) ?? [],
  }));

  return (
    <>
      <AdminHeader
        title="Form submissions"
        subtitle="Every submission received, newest first."
      />
      <SubmissionsList
        submissions={records}
        forms={forms.map((form) => ({ _id: String(form._id), title: form.title }))}
      />
    </>
  );
}
