import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { normalizeColorOverrides } from "@/lib/color-overrides";
import { connectDB } from "@/lib/db";
import { normalizeDocTemplateLayout } from "@/lib/doc-template-layout";
import { DocTemplate } from "@/lib/models";

import { DocTemplateBuilder } from "../../doc-template-builder";
import { loadDocTemplateSource } from "../../template-source";

export const metadata = { title: "Edit doc template" };

export default async function EditDocTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("docs.manage");

  const { id } = await params;
  await connectDB();

  const doc = await DocTemplate.findById(id).lean<any>();
  if (!doc) notFound();

  const source = await loadDocTemplateSource();

  return (
    <DocTemplateBuilder
      template={{
        _id: String(doc._id),
        name: doc.name ?? "",
        slug: doc.slug ?? "",
        isDefault: Boolean(doc.isDefault),
        layout: normalizeDocTemplateLayout(doc.layout),
        colors: normalizeColorOverrides(doc.colors),
      }}
      sources={source.sources}
      docs={source.docs}
      initialDoc={source.initialDoc}
      tree={source.tree}
    />
  );
}
