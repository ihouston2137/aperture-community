import {
  sortCollectionImages,
  type CollectionImage,
  type ResolvedCollection,
} from "./collection-types";
import { connectDB } from "./db";
import {
  defaultLightboxSettings,
  defaultOverlaySettings,
  normalizeCollectionHeader,
  normalizeMetadataDisplay,
  normalizeStyleSlot,
  resolveCollectionDisplay,
} from "./display-templates";
import { Collection, MediaAsset } from "./models";
import { getSiteContent } from "./site-settings";

// Re-exported so callers keep one import site for the collection domain.
export { sortCollectionImages };
export type { CollectionImage, ResolvedCollection };

function toImage(doc: Record<string, any>): CollectionImage {
  return {
    id: String(doc._id),
    url: doc.url ?? "",
    thumbnailUrl: doc.thumbnailUrl ?? "",
    width: doc.width ?? 0,
    height: doc.height ?? 0,
    title: doc.title ?? "",
    alt: doc.alt ?? "",
    caption: doc.caption ?? "",
    author: doc.author ?? "",
    captureDate: doc.captureDate ? new Date(doc.captureDate).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    originalName: doc.originalName ?? "",
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    isNsfw: Boolean(doc.isNsfw),
    orientation: doc.orientation ?? "",
    mediaType: doc.mediaType ?? "image",
  };
}

export async function resolveCollection(
  doc: Record<string, any> | null
): Promise<ResolvedCollection | null> {
  if (!doc) return null;
  await connectDB();

  const siteContent = await getSiteContent();
  const imageIds: string[] = Array.isArray(doc.imageIds) ? doc.imageIds : [];

  const assets = imageIds.length
    ? // Only the fields the gallery renders — a large collection must not pull
      // whole documents (including their usage arrays) into memory.
      await MediaAsset.find({ _id: { $in: imageIds } })
        .select(
          "url thumbnailUrl width height title alt caption author captureDate createdAt originalName tags isNsfw orientation mediaType"
        )
        .lean<any[]>()
    : [];

  const images = sortCollectionImages(
    assets.map(toImage),
    doc.sortMode ?? "createdAt",
    doc.sortDirection ?? "desc",
    Array.isArray(doc.customOrder) ? doc.customOrder : []
  );

  const display = resolveCollectionDisplay(doc, siteContent.collectionDisplayDefaults);

  return {
    id: String(doc._id),
    name: doc.name ?? "",
    slug: doc.slug ?? "",
    description: doc.description ?? "",
    category: doc.category ?? "",
    isPublic: Boolean(doc.isPublic),
    images,
    display,
    overlay: normalizeMetadataDisplay(doc.overlaySettings, defaultOverlaySettings),
    lightbox: normalizeMetadataDisplay(doc.lightboxSettings, defaultLightboxSettings),
    mosaicSpans: (doc.mosaicSpans ?? {}) as ResolvedCollection["mosaicSpans"],
    header: normalizeCollectionHeader(doc.header),
    share: normalizeStyleSlot(doc.share),
    imageShare: normalizeStyleSlot(doc.imageShare),
    pageStyle: normalizeStyleSlot(doc.pageStyle),
    imageStyle: normalizeStyleSlot(doc.imageStyle),
    imageExitStyle: normalizeStyleSlot(doc.imageExitStyle),
    imageContentStyle: normalizeStyleSlot(doc.imageContentStyle),
    // A chosen feature image that has since left the collection falls back the
    // same way an unset one does, so this is never a dangling id.
    featureImage:
      images.find((image) => image.id === String(doc.featureImageId ?? "")) ??
      images[0] ??
      null,
    styleOverrides: (doc.styleOverrides ?? {}) as Record<string, unknown>,
  };
}

export async function getCollectionBySlug(slug: string) {
  await connectDB();
  const doc = await Collection.findOne({ slug }).lean<any>();
  return resolveCollection(doc);
}

export async function getCollectionById(id: string) {
  await connectDB();
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const doc = await Collection.findById(id).lean<any>();
  return resolveCollection(doc);
}

/**
 * The settings of every other collection, so one can be copied onto another.
 *
 * Only what describes how a collection *looks* travels: its layout, metadata,
 * header and styles. Its name, images, custom order and feature image are what
 * make it that collection rather than another, and stay put.
 */
export type CollectionSettingsPreset = {
  _id: string;
  name: string;
  settings: Pick<
    ResolvedCollection,
    | "display"
    | "overlay"
    | "lightbox"
    | "header"
    | "share"
    | "imageShare"
    | "pageStyle"
    | "imageStyle"
    | "imageExitStyle"
    | "imageContentStyle"
  > & { sortMode: string; sortDirection: string };
};

export async function loadCollectionPresets(
  excludeId?: string
): Promise<CollectionSettingsPreset[]> {
  await connectDB();
  const siteContent = await getSiteContent();

  const docs = await Collection.find(excludeId ? { _id: { $ne: excludeId } } : {})
    .select(
      "name sortMode sortDirection display overlaySettings lightboxSettings header share imageShare pageStyle imageStyle imageExitStyle imageContentStyle layoutMode displayMode pageSize imageAspect imageFit pageWidth columnsDesktop columnsTablet columnsMobile shareEnabled shareIconSize imageShareEnabled imageShareIconSize imageNameEnabled imageExitLabel allowDownload allowContextMenu"
    )
    .sort({ name: 1 })
    .lean<any[]>();

  return docs.map((doc) => ({
    _id: String(doc._id),
    name: doc.name ?? "Untitled",
    settings: {
      sortMode: doc.sortMode ?? "createdAt",
      sortDirection: doc.sortDirection ?? "desc",
      display: resolveCollectionDisplay(doc, siteContent.collectionDisplayDefaults),
      overlay: normalizeMetadataDisplay(doc.overlaySettings, defaultOverlaySettings),
      lightbox: normalizeMetadataDisplay(doc.lightboxSettings, defaultLightboxSettings),
      header: normalizeCollectionHeader(doc.header),
      share: normalizeStyleSlot(doc.share),
      imageShare: normalizeStyleSlot(doc.imageShare),
      pageStyle: normalizeStyleSlot(doc.pageStyle),
      imageStyle: normalizeStyleSlot(doc.imageStyle),
      imageExitStyle: normalizeStyleSlot(doc.imageExitStyle),
      imageContentStyle: normalizeStyleSlot(doc.imageContentStyle),
    },
  }));
}
