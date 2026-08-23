import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { getDocSetById } from "@/lib/docs";

import { DocEditor } from "../../../doc-editor";
import { loadDocEditorSource } from "../../../editor-source";

export const metadata = { title: "New document" };

export default async function NewDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentation: string }>;
  searchParams: Promise<{ parentId?: string }>;
}) {
  await requirePermission("docs.manage");

  const { documentation } = await params;
  const { parentId } = await searchParams;

  const set = await getDocSetById(documentation);
  if (!set) notFound();

  const source = await loadDocEditorSource(set._id);

  return (
    <DocEditor
      doc={{
        documentationId: set._id,
        title: "",
        slug: "",
        status: "draft",
        description: "",
        category: "",
        tags: [],
        parentId: parentId ?? "",
        order: 0,
        content: [],
        frontMatter: {},
      }}
      set={set}
      parents={source.parents}
      saved={false}
      imported={false}
    />
  );
}
