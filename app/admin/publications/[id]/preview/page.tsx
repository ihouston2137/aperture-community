import { notFound } from "next/navigation";

import { PublicationExport } from "@/components/publication-export";
import { PublicationScreen } from "@/components/publication-screen";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Zine } from "@/lib/models";
import {
  normalizePublicationPages,
  normalizeRepeatedBlocks,
} from "@/lib/publication-layout";

export const metadata = { title: "Publication preview" };

/** Authenticated preview — drafts are visible here and nowhere else. */
export default async function PublicationPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission("publications.manage");
  const { id } = await params;
  const { view } = await searchParams;

  await connectDB();
  const raw = await Zine.findById(id).lean<any>();
  if (!raw) notFound();

  // Normalized exactly as the public routes do, so the preview and the
  // published page cannot disagree about the content.
  const doc = {
    ...raw,
    pages: normalizePublicationPages(raw.pages),
    repeatedBlocks: normalizeRepeatedBlocks(raw.repeatedBlocks),
  };

  return (
    <>
      <PublicationExport audioUrl={doc.audio?.url} fileName={doc.slug ?? "publication"} />
      <PublicationScreen doc={doc} view={view} />
    </>
  );
}
