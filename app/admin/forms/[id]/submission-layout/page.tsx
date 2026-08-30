import { notFound } from "next/navigation";

import { AdminHeader, Notice, Panel } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { collectFormFields, normalizeFormLayout } from "@/lib/form-layout";
import { FormDefinition } from "@/lib/models";

import { SubmissionLayoutBuilder, type LayoutEntry } from "./submission-layout-builder";

export const metadata = { title: "Submission layout" };

export default async function SubmissionLayoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePermission("forms.manage");
  const { id } = await params;
  const { saved } = await searchParams;

  await connectDB();
  const form = await FormDefinition.findById(id).lean<any>();
  if (!form) notFound();

  const fields = collectFormFields(normalizeFormLayout(form.layout));
  const idsOf = (value: unknown): string[] =>
    (Array.isArray(value) ? value : []).map((entry: any) => String(entry?.id ?? entry));

  const configured = idsOf(form.submissionLayout);
  const inList = idsOf(form.submissionColumns);

  // Configured fields first (in their saved order), then anything added since.
  const ordered = [
    ...configured
      .map((fieldId) => fields.find((field) => field.id === fieldId))
      .filter(Boolean),
    ...fields.filter((field) => !configured.includes(field.id)),
  ];

  const entries: LayoutEntry[] = ordered.map((field, index) => ({
    id: field!.id,
    label: field!.label || field!.name || field!.id,
    // A form with no saved layout shows every field.
    visible: configured.length === 0 || configured.includes(field!.id),
    /*
     * Unconfigured, the list shows the first three fields.
     *
     * Not every field: a row of forty columns is not a list, it is the entry
     * spread sideways. Not none either — a list of dates and nothing else
     * cannot be scanned for the submission somebody is looking for.
     */
    inList: inList.length === 0 ? index < 3 : inList.includes(field!.id),
  }));

  return (
    <>
      <AdminHeader
        title={`Submission layout · ${form.title}`}
        subtitle="Choose which fields the submissions inbox lists, which it opens, and their order."
      />
      {saved ? <Notice>Layout saved.</Notice> : null}

      <Panel>
        <SubmissionLayoutBuilder formId={String(form._id)} entries={entries} />
      </Panel>
    </>
  );
}
