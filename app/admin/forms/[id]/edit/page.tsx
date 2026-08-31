import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { adminExit } from "@/lib/admin-exit";
import { loadBuilderSources } from "@/lib/builder-sources";
import { connectDB } from "@/lib/db";
import { normalizeFormLayout, normalizeFormSettings } from "@/lib/form-layout";
import { FormDefinition } from "@/lib/models";

import { FormBuilder } from "../../form-builder";

export const metadata = { title: "Edit form" };

export default async function EditFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  await requirePermission("forms.manage");
  const { id } = await params;
  const { from } = await searchParams;

  await connectDB();
  const doc = await FormDefinition.findById(id).lean<any>();
  if (!doc) notFound();

  // A test has no page to lay out; its questions are a list, edited elsewhere.
  if (doc.kind === "test") redirect(`/admin/forms/${id}/test`);

  const sources = await loadBuilderSources();

  return (
    <FormBuilder
      form={{
        _id: String(doc._id),
        title: doc.title ?? "",
        slug: doc.slug ?? "",
        status: doc.status ?? "draft",
        layout: normalizeFormLayout(doc.layout),
        settings: normalizeFormSettings(doc.settings),
      }}
      sources={sources}
      exit={adminExit(from, { href: "/admin/forms", label: "Forms" })}
    />
  );
}
