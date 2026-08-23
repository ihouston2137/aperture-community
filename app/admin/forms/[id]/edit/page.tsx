import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { connectDB } from "@/lib/db";
import { normalizeFormLayout, normalizeFormSettings } from "@/lib/form-layout";
import { FormDefinition } from "@/lib/models";

import { FormBuilder } from "../../form-builder";

export const metadata = { title: "Edit form" };

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("forms.manage");
  const { id } = await params;

  await connectDB();
  const doc = await FormDefinition.findById(id).lean<any>();
  if (!doc) notFound();

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
    />
  );
}
