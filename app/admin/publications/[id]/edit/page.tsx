import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { connectDB } from "@/lib/db";
import { Zine } from "@/lib/models";
import {
  normalizeAudio,
  normalizeCanvasSize,
  normalizePageTemplates,
  normalizePublicationPages,
  normalizeRepeatedBlocks,
  normalizeSlideshow,
  POST_VIEW_PRESETS,
  type PublicationKind,
  type Transition,
} from "@/lib/publication-layout";
import { loadPublicationSources } from "@/lib/publication-sources";

import { PublicationEditor } from "../../publication-editor";

export const metadata = { title: "Edit publication" };

export default async function EditPublicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `view` carries the post view being edited back across a save. */
  searchParams: Promise<{ view?: string }>;
}) {
  await requirePermission("publications.manage");
  const { id } = await params;
  const { view } = await searchParams;

  await connectDB();
  const doc = await Zine.findById(id).lean<any>();
  if (!doc) notFound();

  const pages = normalizePublicationPages(doc.pages);
  const repeatedBlocks = normalizeRepeatedBlocks(doc.repeatedBlocks);
  const pageTemplates = normalizePageTemplates(doc.pageTemplates);
  const [sources, publicationSources] = await Promise.all([
    loadBuilderSources(),
    // Layout blocks are drawn on the canvas like any other, so the records they
    // reference have to be loaded too — the same list the published viewer
    // gathers. Without them a shape or story placed on a layout resolves to
    // nothing here while publishing perfectly well.
    loadPublicationSources(pages, [
      ...repeatedBlocks,
      ...pageTemplates.flatMap((item) => item.blocks),
    ]),
  ]);

  return (
    <PublicationEditor
      publication={{
        _id: String(doc._id),
        title: doc.title ?? "",
        slug: doc.slug ?? "",
        description: doc.description ?? "",
        kind: (doc.kind ?? "zine") as PublicationKind,
        status: doc.status ?? "draft",
        listed: doc.listed !== false,
        transition: (doc.transition ?? "fade") as Transition,
        presentationSize: normalizeCanvasSize(doc.presentationSize),
        postViews:
          Array.isArray(doc.postViews) && doc.postViews.length > 0
            ? doc.postViews
            : [...POST_VIEW_PRESETS],
        slideshow: normalizeSlideshow(doc.slideshow),
        audio: normalizeAudio(doc.audio),
        pages,
        repeatedBlocks,
        pageTemplates,
        isTemplate: Boolean(doc.isTemplate),
        coverMediaId: doc.coverMediaId ?? "",
        coverUrl: doc.coverUrl ?? "",
      }}
      sources={sources}
      publicationSources={publicationSources}
      // The URL wins — a save round-trip carries it — otherwise the view
      // this post was last edited in, so reopening it does not fall back to
      // the first preset.
      initialView={view || doc.postView || undefined}
    />
  );
}
