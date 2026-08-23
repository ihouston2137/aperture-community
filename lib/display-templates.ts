import { ASPECT_RATIOS, type AspectRatio } from "./aspect-ratio";
import { customStyleClassName } from "./custom-style-css";
import { CONTENT_WIDTHS, type ContentWidth } from "./site-values";
import { normalizeStyleValues, styleValuesToCss, type StyleValues } from "./style-values";

/**
 * Defaults and merge helpers for story and collection display settings.
 *
 * A collection's own values are laid over `SiteContent.collectionDisplayDefaults`,
 * so the site defaults are a starting point rather than a mode to opt out of.
 */

/**
 * One thing the central style editor can dress: a named style, or local values
 * when none is chosen. The same pair every builder block carries.
 */
export type StyleSlot = { styleSlug: string; style: StyleValues };

export const emptyStyleSlot: StyleSlot = { styleSlug: "", style: {} };

export function normalizeStyleSlot(input: unknown): StyleSlot {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    styleSlug: typeof raw.styleSlug === "string" ? raw.styleSlug : "",
    style: normalizeStyleValues(raw.style),
  };
}

/** A named style wins over local values, exactly as it does for page blocks. */
export function styleSlotProps(slot: StyleSlot | undefined) {
  if (slot?.styleSlug) {
    return { className: customStyleClassName(slot.styleSlug), style: undefined };
  }
  return { className: "", style: styleValuesToCss(slot?.style) };
}

export type MetaPlacement =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const META_PLACEMENTS: MetaPlacement[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const META_FIELDS = [
  "title",
  "caption",
  "author",
  "captureDate",
  "location",
  "tags",
  "filename",
] as const;

export type MetaField = (typeof META_FIELDS)[number];

export const META_FIELD_LABELS: Record<MetaField, string> = {
  title: "Title",
  caption: "Caption",
  author: "Author",
  captureDate: "Capture date",
  location: "Location",
  tags: "Tags",
  filename: "File name",
};

export type MetadataDisplay = {
  enabled: boolean;
  /**
   * Grid overlay only. The lightbox and the single image page lay their
   * metadata out in one fixed way — under the picture, at its width, one field
   * per row — so they have nothing to place.
   */
  placement: MetaPlacement;
  /** Grid overlay only, for the same reason. */
  alwaysVisible: boolean;
  fields: MetaField[];
  /** Each shown field can be dressed on its own through the style editor. */
  fieldStyles: Partial<Record<MetaField, StyleSlot>>;
};

export const defaultOverlaySettings: MetadataDisplay = {
  enabled: true,
  placement: "bottom-left",
  alwaysVisible: false,
  fields: ["title"],
  fieldStyles: {},
};

export const defaultLightboxSettings: MetadataDisplay = {
  enabled: true,
  placement: "bottom-left",
  alwaysVisible: true,
  fields: ["title", "caption", "captureDate"],
  fieldStyles: {},
};


/**
 * What a collection page shows above its gallery. Each part can be turned off
 * and dressed independently, which is why they are slots rather than one style.
 */
export type CollectionHeader = {
  showCategory: boolean;
  showTitle: boolean;
  showDescription: boolean;
  category: StyleSlot;
  title: StyleSlot;
  description: StyleSlot;
};

export const defaultCollectionHeader: CollectionHeader = {
  showCategory: false,
  showTitle: true,
  showDescription: true,
  category: emptyStyleSlot,
  title: emptyStyleSlot,
  description: emptyStyleSlot,
};

export function normalizeCollectionHeader(input: unknown): CollectionHeader {
  const raw = (input ?? {}) as Record<string, unknown>;
  const flag = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;

  return {
    showCategory: flag(raw.showCategory, defaultCollectionHeader.showCategory),
    showTitle: flag(raw.showTitle, defaultCollectionHeader.showTitle),
    showDescription: flag(raw.showDescription, defaultCollectionHeader.showDescription),
    category: normalizeStyleSlot(raw.category),
    title: normalizeStyleSlot(raw.title),
    description: normalizeStyleSlot(raw.description),
  };
}

/**
 * `feed` is deliberately absent: a single-column grid at the media's actual
 * ratio is the same thing, without a second layout to keep in step.
 */
export const COLLECTION_LAYOUTS = ["grid", "mosaic", "masonry"] as const;
export type CollectionLayout = (typeof COLLECTION_LAYOUTS)[number];

export type CollectionDisplay = {
  layoutMode: CollectionLayout;
  displayMode: "all" | "lazy" | "pagination";
  pageSize: number;
  /** The frame every tile is held to; `actual` lets each keep its own shape. */
  imageAspect: AspectRatio;
  /**
   * How the media meets the space its tile occupies. `fill` scales by whichever
   * axis is needed to cover it, cropping the other; `full` shows the whole
   * frame, centred. Applies under `actual` too, where the space comes from the
   * tallest tile in the row rather than from a stated ratio.
   */
  imageFit: "fill" | "full";
  /** The same named scale rows, the header and the footer use. */
  pageWidth: ContentWidth;
  columnsDesktop: number;
  columnsTablet: number;
  columnsMobile: number;
  shareEnabled: boolean;
  /** Edge of the page's share icon, in rem. */
  shareIconSize: number;
  /** A share button beside the download one, copying a single image's address. */
  imageShareEnabled: boolean;
  /** Edge of the opened image's share icon, in rem. */
  imageShareIconSize: number;
  /**
   * The collection's name above an image on its own page, wearing whatever
   * style the collection page's title wears. Not shown in the lightbox, which
   * is already sitting on top of the gallery it came from.
   */
  imageNameEnabled: boolean;
  /** Wording of the link back to the gallery from an image's own page. */
  imageExitLabel: string;
  allowDownload: boolean;
  allowContextMenu: boolean;
};

export const defaultCollectionDisplay: CollectionDisplay = {
  layoutMode: "grid",
  displayMode: "all",
  pageSize: 24,
  imageAspect: "1:1",
  imageFit: "fill",
  pageWidth: "standard",
  columnsDesktop: 3,
  columnsTablet: 2,
  columnsMobile: 1,
  shareEnabled: true,
  shareIconSize: 1.5,
  imageShareEnabled: false,
  imageShareIconSize: 1.5,
  imageNameEnabled: false,
  imageExitLabel: "View more images",
  allowDownload: false,
  allowContextMenu: false,
};

function mergeInto<T extends object>(base: T, override: unknown): T {
  if (!override || typeof override !== "object") return { ...base };
  const source = override as Record<string, unknown>;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out as T;
}

export function normalizeMetadataDisplay(
  input: unknown,
  base: MetadataDisplay
): MetadataDisplay {
  const merged = mergeInto(base, input);
  const raw = (input ?? {}) as Record<string, unknown>;
  const styles = (raw.fieldStyles ?? {}) as Record<string, unknown>;

  const fieldStyles: Partial<Record<MetaField, StyleSlot>> = {};
  for (const field of META_FIELDS) {
    if (styles[field]) fieldStyles[field] = normalizeStyleSlot(styles[field]);
  }

  return {
    enabled: Boolean(merged.enabled),
    placement: META_PLACEMENTS.includes(merged.placement) ? merged.placement : base.placement,
    alwaysVisible: Boolean(merged.alwaysVisible),
    fields: Array.isArray(merged.fields)
      ? (merged.fields.filter((field) =>
          META_FIELDS.includes(field as MetaField)
        ) as MetaField[])
      : base.fields,
    fieldStyles,
  };
}

/**
 * The effective display settings for a collection: the site defaults with the
 * collection's own values laid over them.
 */
export function resolveCollectionDisplay(
  collection: Record<string, unknown>,
  siteDefaults: unknown
): CollectionDisplay {
  const resolved = mergeInto(mergeInto(defaultCollectionDisplay, siteDefaults), collection);
  const fallback = defaultCollectionDisplay;

  return {
    ...resolved,
    // These four were saved under other names, or with values that no longer
    // exist, so each is checked rather than trusted.
    layoutMode: COLLECTION_LAYOUTS.includes(resolved.layoutMode)
      ? resolved.layoutMode
      : fallback.layoutMode,
    imageAspect: ASPECT_RATIOS.includes(resolved.imageAspect)
      ? resolved.imageAspect
      : fallback.imageAspect,
    // `fit` was this option's earlier name for showing the whole frame.
    imageFit: resolved.imageFit === "full" || (resolved.imageFit as string) === "fit"
      ? "full"
      : "fill",
    pageWidth: CONTENT_WIDTHS.includes(resolved.pageWidth)
      ? resolved.pageWidth
      : fallback.pageWidth,
    // Numbers arrive from form fields as strings, and a zero-sized icon is an
    // invisible control rather than a hidden one.
    shareIconSize: iconSize(resolved.shareIconSize, fallback.shareIconSize),
    imageShareIconSize: iconSize(
      resolved.imageShareIconSize,
      fallback.imageShareIconSize
    ),
  };
}

function iconSize(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 8);
}
