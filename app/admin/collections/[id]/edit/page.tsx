import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { getCollectionById, loadCollectionPresets } from "@/lib/collections";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models";
import { getAppearance, getSiteContent } from "@/lib/site-settings";

import { deleteCollectionAction } from "../../actions";
import { CollectionEditor } from "../../collection-editor";

export const metadata = { title: "Edit collection" };

export default async function EditCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePermission("collections.manage");
  const { id } = await params;
  const { saved } = await searchParams;

  await connectDB();
  const doc = await Collection.findById(id).lean<any>();
  if (!doc) notFound();

  // Reuse the public resolver so the editor preview and the live gallery agree.
  const resolved = await getCollectionById(id);
  if (!resolved) notFound();

  const [sources, appearance, content, presets] = await Promise.all([
    loadBuilderSources(),
    getAppearance(),
    getSiteContent(),
    // Every other collection, so this one can be dressed like an existing
    // gallery. Itself excluded: copying a collection onto itself does nothing.
    loadCollectionPresets(id),
  ]);

  return (
    <CollectionEditor
      saved={Boolean(saved)}
      onDelete={deleteCollectionAction}
      collection={{
        _id: resolved.id,
        name: resolved.name,
        slug: resolved.slug,
        description: resolved.description,
        category: resolved.category,
        isPublic: resolved.isPublic,
        imageIds: resolved.images.map((image) => image.id),
        images: resolved.images,
        sortMode: doc.sortMode ?? "createdAt",
        sortDirection: doc.sortDirection ?? "desc",
        customOrder: doc.customOrder ?? [],
        display: resolved.display,
        overlay: resolved.overlay,
        lightbox: resolved.lightbox,
        mosaicSpans: resolved.mosaicSpans,
        header: resolved.header,
        share: resolved.share,
        imageShare: resolved.imageShare,
        pageStyle: resolved.pageStyle,
        imageStyle: resolved.imageStyle,
        imageExitStyle: resolved.imageExitStyle,
        imageContentStyle: resolved.imageContentStyle,
        featureImageId: String(doc.featureImageId ?? ""),
      }}
      presets={presets}
      styles={sources.styles}
      fonts={sources.fonts}
      chrome={{ appearance, content }}
    />
  );
}
