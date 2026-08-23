import { ASPECT_RATIOS, type AspectRatio } from "./aspect-ratio";
import { makeId } from "./page-layout";
import {
  normalizeResponsiveStyle,
  type ResponsiveStyleFields,
} from "./responsive-style";
import { STORY_MEDIA_SIZES, type StoryMediaSize } from "./story-template-layout";
import { normalizeStyleValues, type StyleValues } from "./style-values";

/**
 * The collection half of a container's contents.
 *
 * A container can be bound to a collection just as it can to a story, and these
 * are the slots that draw from it: each names a part of the collection rather
 * than carrying content of its own. Deliberately parallel to the story slots —
 * same style-slot arrangement, same feature-media sizing — so an editor who has
 * arranged one already knows how to arrange the other.
 *
 * Types are prefixed with `collection` for the same reason story slots are
 * prefixed with `story`: a page block legitimately called `image` must never be
 * mistaken for the collection's feature image.
 */

export const COLLECTION_SLOT_BLOCK_TYPES = [
  "collectionName",
  "collectionCategory",
  "collectionDescription",
  "collectionFeatureMedia",
  "collectionGallery",
  "collectionLink",
] as const;

export type CollectionSlotBlockType = (typeof COLLECTION_SLOT_BLOCK_TYPES)[number];

export type CollectionSlotBlock = ResponsiveStyleFields & {
  id: string;
  type: CollectionSlotBlockType;
  styleSlug?: string;
  textStyle?: StyleValues;

  /* `collectionFeatureMedia`, matching the story feature media block. */
  showCaption?: boolean;
  mediaSize?: StoryMediaSize;
  mediaFit?: "fit" | "fill";
  mediaAspect?: AspectRatio;
  mediaWidth?: number; // rem
  mediaHeight?: number; // rem

  /* `collectionLink` */
  linkText?: string;
  iconName?: string;
  iconSize?: number; // rem
  iconPlacement?: "before" | "after";
  iconStyleSlug?: string;
  iconStyle?: StyleValues;

  /** Styles for the parts inside a block, as the story slots have. */
  imageStyleSlug?: string;
  imageStyle?: StyleValues;
  captionStyleSlug?: string;
  captionStyle?: StyleValues;
};

export function isCollectionSlotBlock(block: {
  type: string;
}): block is CollectionSlotBlock {
  return (COLLECTION_SLOT_BLOCK_TYPES as readonly string[]).includes(block.type);
}

export function createCollectionSlotBlock(
  type: CollectionSlotBlockType
): CollectionSlotBlock {
  const block: CollectionSlotBlock = { id: makeId("cblock"), type };

  if (type === "collectionFeatureMedia") {
    block.showCaption = true;
    block.mediaSize = "scaledWidth";
    block.mediaFit = "fill";
    block.mediaAspect = "actual";
    block.mediaWidth = 24;
    block.mediaHeight = 16;
  }
  if (type === "collectionLink") {
    block.linkText = "View the collection";
    block.iconName = "ArrowRight";
    block.iconSize = 1;
    block.iconPlacement = "after";
  }

  return block;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeCollectionSlotBlock(
  input: unknown
): CollectionSlotBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type as CollectionSlotBlockType;
  if (!COLLECTION_SLOT_BLOCK_TYPES.includes(type)) return null;

  const block: CollectionSlotBlock = { id: str(raw.id) || makeId("cblock"), type };

  if (raw.styleSlug) block.styleSlug = str(raw.styleSlug);
  if (raw.textStyle) block.textStyle = normalizeStyleValues(raw.textStyle);
  normalizeResponsiveStyle(raw, block, "textStyle");

  for (const slot of ["image", "caption", "icon"] as const) {
    const slugKey = `${slot}StyleSlug` as const;
    const valuesKey = `${slot}Style` as const;
    if (raw[slugKey]) block[slugKey] = str(raw[slugKey]);
    if (raw[valuesKey]) block[valuesKey] = normalizeStyleValues(raw[valuesKey]);
    normalizeResponsiveStyle(raw, block, valuesKey);
  }

  if (type === "collectionFeatureMedia") {
    block.showCaption = raw.showCaption === undefined ? true : Boolean(raw.showCaption);
    block.mediaSize = STORY_MEDIA_SIZES.includes(raw.mediaSize as StoryMediaSize)
      ? (raw.mediaSize as StoryMediaSize)
      : "scaledWidth";
    block.mediaFit = raw.mediaFit === "fit" ? "fit" : "fill";
    block.mediaAspect = ASPECT_RATIOS.includes(raw.mediaAspect as AspectRatio)
      ? (raw.mediaAspect as AspectRatio)
      : "actual";
    block.mediaWidth = positiveOr(raw.mediaWidth, 24);
    block.mediaHeight = positiveOr(raw.mediaHeight, 16);
  }

  if (type === "collectionLink") {
    block.linkText = str(raw.linkText, "View the collection");
    block.iconName = str(raw.iconName);
    block.iconSize = positiveOr(raw.iconSize, 1);
    block.iconPlacement = raw.iconPlacement === "before" ? "before" : "after";
  }

  return block;
}
