import type {
  CollectionDisplay,
  CollectionHeader,
  MetadataDisplay,
  StyleSlot,
} from "./display-templates";

/**
 * The shapes a collection renders from, split out from `lib/collections.ts` so
 * client components can import them — and the sort — without pulling Mongoose
 * into the browser bundle.
 */

export type CollectionImage = {
  id: string;
  url: string;
  /** Grid-sized derivative; falls back to `url` when one has not been made. */
  thumbnailUrl: string;
  width: number;
  height: number;
  title: string;
  alt: string;
  caption: string;
  author: string;
  captureDate: string | null;
  createdAt: string | null;
  originalName: string;
  tags: string[];
  isNsfw: boolean;
  orientation: string;
  mediaType: string;
};

export type ResolvedCollection = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  isPublic: boolean;
  images: CollectionImage[];
  display: CollectionDisplay;
  overlay: MetadataDisplay;
  lightbox: MetadataDisplay;
  mosaicSpans: Record<string, { colSpan?: number; rowSpan?: number }>;
  /** Category, title and description shown above the gallery. */
  header: CollectionHeader;
  /** Dresses the page's copy-link button. */
  share: StyleSlot;
  /** Dresses the copy-link button on an opened image. */
  imageShare: StyleSlot;
  /** Dresses the page as a whole. */
  pageStyle: StyleSlot;
  /** Dresses every tile in the gallery. */
  imageStyle: StyleSlot;
  /** Dresses the link back to the gallery from an image's own page. */
  imageExitStyle: StyleSlot;
  /** Dresses the box around an opened image and its metadata. */
  imageContentStyle: StyleSlot;
  /**
   * The one image that stands for this collection. Falls back to the first in
   * the current order, so a collection always has one.
   */
  featureImage: CollectionImage | null;
  styleOverrides: Record<string, unknown>;
};

/**
 * The gallery's order.
 *
 * Lives here because the collection editor sorts the same list client-side the
 * moment the setting changes — a preview that only reordered after a save would
 * be showing the wrong gallery.
 */
export function sortCollectionImages(
  images: CollectionImage[],
  sortMode: string,
  direction: string,
  customOrder: string[]
): CollectionImage[] {
  if (sortMode === "custom") {
    const rank = new Map(customOrder.map((id, index) => [id, index]));
    return [...images].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  const factor = direction === "asc" ? 1 : -1;
  return [...images].sort((a, b) => {
    if (sortMode === "originalName") {
      return a.originalName.localeCompare(b.originalName) * factor;
    }
    const key = sortMode === "captureDate" ? "captureDate" : "createdAt";
    const aTime = a[key] ? Date.parse(a[key] as string) : 0;
    const bTime = b[key] ? Date.parse(b[key] as string) : 0;
    return (aTime - bTime) * factor;
  });
}
