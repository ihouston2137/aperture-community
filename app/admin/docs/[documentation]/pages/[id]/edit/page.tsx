import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeDocBlocks } from "@/lib/doc-layout";
import { getDocSetById } from "@/lib/docs";
import { DocPage } from "@/lib/models";

import { DocEditor } from "../../../../doc-editor";
import { loadDocEditorSource } from "../../../../editor-source";

export const metadata = { title: "Edit document" };

export default async function EditDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentation: string; id: string }>;
  searchParams: Promise<{ saved?: string; imported?: string }>;
}) {
  await requirePermission("docs.manage");

  const { documentation, id } = await params;
  const { saved, imported } = await searchParams;

  const set = await getDocSetById(documentation);
  if (!set) notFound();

  await connectDB();
  const doc = await DocPage.findById(id).lean<any>();
  if (!doc || String(doc.documentationId) !== set._id) notFound();

  const source = await loadDocEditorSource(set._id, id);

  return (
    <DocEditor
      doc={{
        _id: String(doc._id),
        documentationId: set._id,
        title: doc.title ?? "",
        slug: doc.slug ?? "",
        status: doc.status === "published" ? "published" : "draft",
        description: doc.description ?? "",
        category: doc.category ?? "",
        tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
        parentId: String(doc.parentId ?? ""),
        order: Number.isFinite(doc.order) ? Number(doc.order) : 0,
        content: normalizeDocBlocks(doc.content),
        frontMatter: (doc.frontMatter ?? {}) as Record<string, string>,
      }}
      set={set}
      parents={source.parents}
      saved={Boolean(saved)}
      imported={Boolean(imported)}
    />
  );
}
