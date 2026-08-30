import type { CSSProperties } from "react";
import {
  menuBlockDirection,
  menuBlockLayout,
  type MenuBlockDirection,
  type MenuBlockLayout,
} from "./menu-types";

import { ASPECT_RATIOS, aspectRatioCss, type AspectRatio } from "./aspect-ratio";
import { normalizeCalendarDisplay, type CalendarDisplay } from "./calendar";
import { normalizeEventListSettings, type EventListSettings } from "./event-list";
import { isFieldBlock } from "./form-block-types";
import { normalizeContainerLayout, type ContainerLayout } from "./page-container-layout";
import { normalizeRichText } from "./rich-text";
import { sanitizeMediaPath } from "./protected-media-url";
import {
  normalizeResponsiveStyle,
  type ResponsiveStyleFields,
} from "./responsive-style";
import { MEDIA_CLICK_ACTIONS, type MediaClickAction } from "./story-media";
import {
  CONTENT_WIDTHS,
  CONTENT_WIDTH_VALUES,
  type ContentWidth,
} from "./site-values";
import { normalizeStyleValues, type StyleValues } from "./style-values";

/* ------------------------------------------------------------ Block types */

export const PAGE_BLOCK_TYPES = [
  "headline",
  "plainText",
  "richText",
  "image",
  "video",
  "panoramaImage",
  "panoramaVideo",
  "videoEmbed",
  "icon",
  "shape",
  "customShape",
  "qrCode",
  "button",
  // A story on a page comes from a story-bound container and its story slots,
  // which render the real thing rather than a card summary of it.
  "bio",
  "collection",
  "calendar",
  "eventList",
  "form",
  // A named menu, placed on a page as a list or a dropdown.
  "menu",
  "container",
] as const;

export type PageBlockType = (typeof PAGE_BLOCK_TYPES)[number];

/**
 * Shapes are deliberately limited to rectangle/ellipse/triangle/line.
 * Rectangle and ellipse render as filled SVG areas — never as a collapsed
 * border-only element — so width and height are always explicit.
 */
export const SHAPE_KINDS = [
  "rectangle",
  "ellipse",
  "triangle",
  "star",
  "trapezoid",
  "rhombus",
  "parallelogram",
  "line",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export const SHAPE_KIND_LABELS: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  star: "Star",
  trapezoid: "Trapezoid",
  rhombus: "Rhombus",
  parallelogram: "Parallelogram",
  line: "Line",
};

/**
 * Where a shape block's text sits.
 *
 * `inside` lays the text into the shape's own silhouette — it is clipped by the
 * outline, so a word can never hang off the side of a triangle. `above` puts it
 * in the flow above the shape, where nothing constrains it.
 */
export const SHAPE_TEXT_PLACEMENTS = ["inside", "above"] as const;
export type ShapeTextPlacement = (typeof SHAPE_TEXT_PLACEMENTS)[number];

export const SHAPE_TEXT_PLACEMENT_LABELS: Record<ShapeTextPlacement, string> = {
  inside: "Inside the shape",
  above: "Above the shape",
};

/** Where a linked image block points. */
export const PAGE_LINK_TYPES = ["page", "collection", "url"] as const;
export type PageLinkType = (typeof PAGE_LINK_TYPES)[number];

export const PAGE_LINK_TYPE_LABELS: Record<PageLinkType, string> = {
  page: "Page",
  collection: "Collection",
  url: "Custom URL",
};

export type PageBlock = ResponsiveStyleFields & {
  id: string;
  type: PageBlockType;

  /** When set, named style wins and local text settings are ignored. */
  styleSlug?: string;
  textStyle?: StyleValues;

  // text
  text?: string;
  html?: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;

  // media
  mediaId?: string;
  mediaUrl?: string;
  alt?: string;
  caption?: string;
  width?: number; // rem, 0 = full width
  height?: number; // rem, 0 = auto
  radius?: number; // rem
  objectFit?: "cover" | "contain";
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;

  // icon / shape
  iconName?: string;
  iconSize?: number; // rem
  color?: string;
  shapeKind?: ShapeKind;
  shapeSlug?: string;
  strokeWidth?: number; // rem — thickness of the `line` shape
  borderWidth?: number; // rem — outline around a filled shape
  borderColor?: string;
  /**
   * A shape's label. `text` above carries the wording; these two say where it
   * goes and how it looks — its own style slot, because the block's own style
   * dresses the shape rather than the writing on it.
   */
  textPlacement?: ShapeTextPlacement;
  shapeTextStyleSlug?: string;
  shapeTextStyle?: StyleValues;

  // qr
  qrValue?: string;

  /**
   * A YouTube or Vimeo address, kept as it was pasted so the field shows what
   * was typed. The renderer turns it into the embed form.
   */
  embedUrl?: string;

  // button
  label?: string;
  href?: string;
  newTab?: boolean;

  // image click action
  clickAction?: MediaClickAction;
  linkType?: PageLinkType;
  /** Ids rather than resolved paths, so a renamed slug does not break a link. */
  linkPageId?: string;
  linkCollectionId?: string;
  linkHref?: string;
  linkNewTab?: boolean;

  // calendar
  calendar?: CalendarDisplay;

  /**
   * An event list dresses two boxes, so it carries two style slots beyond the
   * block's own: the container around the run of items, and the container
   * around each one.
   */
  eventList?: EventListSettings;
  listStyleSlug?: string;
  listStyle?: StyleValues;
  itemStyleSlug?: string;
  itemStyle?: StyleValues;

  // references
  storyId?: string;
  bioId?: string;
  collectionId?: string;
  formId?: string;

  // menu
  menuId?: string;
  menuLayout?: MenuBlockLayout;
  menuDirection?: MenuBlockDirection;
  /** Closed until opened, for the dropdown form. */
  menuButtonText?: string;

  // container
  container?: ContainerLayout;

  align?: "left" | "center" | "right";
};

/* -------------------------------------------------------------- Row/column */

/**
 * `none` is transparent — whatever sits behind shows through. `site` paints the
 * content colour from Appearance, which is what a nested element needs when the
 * thing behind it is itself coloured. `storyFeature` is only meaningful inside
 * a story-bound container, and resolves to that story's feature media.
 */
export const BACKGROUND_TYPES = [
  "none",
  "site",
  "color",
  "image",
  "video",
  "storyFeature",
  "collectionFeature",
] as const;

export type BackgroundType = (typeof BACKGROUND_TYPES)[number];

/** Background types that paint media rather than a flat colour. */
export const MEDIA_BACKGROUNDS: readonly BackgroundType[] = [
  "image",
  "video",
  "storyFeature",
  "collectionFeature",
];

/**
 * Backgrounds whose media comes from whatever the container is bound to rather
 * than from a file picked on the block. They carry no URL of their own, so
 * everything that keys media by address has to account for them.
 */
export function isBoundMediaBackground(type: string): boolean {
  return type === "storyFeature" || type === "collectionFeature";
}

/**
 * How background media is scaled into its box.
 *
 * `width` is the one that changes the box: the media spans the full width and
 * the box grows to the height that implies, which is the only way a container
 * area — whose height otherwise comes from its content — can show a whole
 * image. The other two fill a box that is already sized, cropping (`height`) or
 * fitting inside it (`full`).
 */
export const BACKGROUND_FITS = ["width", "height", "aspect", "full"] as const;
export type BackgroundFit = (typeof BACKGROUND_FITS)[number];

export const BACKGROUND_FIT_LABELS: Record<BackgroundFit, string> = {
  width: "Scale to width",
  height: "Scale to height",
  aspect: "Scale to aspect ratio",
  full: "Full media",
};

export const BACKGROUND_FIT_HELP: Record<BackgroundFit, string> = {
  width: "The media spans the full width, and the box grows to the height that gives it.",
  height: "The media fills the height the content sets, cropping the sides.",
  aspect: "The box is held to the ratio below, and the media is cropped to fill it.",
  full: "The whole media fits inside the box, leaving space on one axis.",
};

export type SpacingSettings = {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
};

export type BackgroundSettings = {
  backgroundType: BackgroundType;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundMediaUrl: string;
  backgroundFit: BackgroundFit;
  /** The frame the box is held to; only read when the fit is `aspect`. */
  backgroundAspect: AspectRatio;
  backgroundAlignX: "left" | "center" | "right";
  backgroundAlignY: "top" | "center" | "bottom";
  /**
   * Painted over a media background so text stays readable. Carries its own
   * transparency in the colour value, so an empty string means no overlay.
   */
  backgroundOverlay: string;
};

export type BorderSettings = {
  borderWidth: number; // rem
  borderColor: string;
  borderRadius: number; // rem
};

export type RowSettings = SpacingSettings &
  BackgroundSettings &
  BorderSettings & {
    /** Full / Wide / Standard / Narrow, matching the header and footer. */
    width: ContentWidth;
    /**
     * Where the columns sit across the row.
     *
     * Only visible when they do not fill it: columns spanning twelve of twelve
     * leave nothing to align. A row of one six-wide column is the case this
     * exists for.
     */
    align: "left" | "center" | "right";
    verticalAlign: "top" | "center" | "bottom";
    parallax: boolean;
  };

/**
 * What a container and a container area both carry. A column adds alignment on
 * top; the container itself has none, because its grid decides placement.
 */
export type ContainerSettings = SpacingSettings & BackgroundSettings & BorderSettings;

export type ColumnSettings = ContainerSettings & {
  align: "left" | "center" | "right";
  verticalAlign: "top" | "center" | "bottom";
};

export type PageColumn = {
  id: string;
  /** Share of the row, 1–12 out of `row` total. */
  span: number;
  settings: ColumnSettings;
  blocks: PageBlock[];
};

export type PageRow = {
  id: string;
  settings: RowSettings;
  columns: PageColumn[];
};

export type PageLayout = PageRow[];

/* ---------------------------------------------------------------- Defaults */

/** Rows, columns and blocks start with no spacing at all. */
export const defaultSpacing: SpacingSettings = {
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
};

export const defaultBackground: BackgroundSettings = {
  backgroundType: "none",
  backgroundColor: "#ffffff",
  backgroundOpacity: 1,
  backgroundMediaUrl: "",
  backgroundFit: "width",
  backgroundAspect: "16:9",
  backgroundAlignX: "center",
  backgroundAlignY: "center",
  backgroundOverlay: "",
};

export const defaultBorder: BorderSettings = {
  borderWidth: 0,
  borderColor: "#16181d",
  borderRadius: 0,
};

export const defaultRowSettings: RowSettings = {
  ...defaultSpacing,
  ...defaultBackground,
  ...defaultBorder,
  width: "standard",
  align: "left",
  verticalAlign: "top",
  parallax: false,
};

export const defaultContainerSettings: ContainerSettings = {
  ...defaultSpacing,
  ...defaultBackground,
  ...defaultBorder,
};

export const defaultColumnSettings: ColumnSettings = {
  ...defaultContainerSettings,
  align: "left",
  verticalAlign: "top",
};

export const GRID_UNITS = 12;

let idCounter = 0;
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function createBlock(type: PageBlockType): PageBlock {
  const block: PageBlock = { id: makeId("block"), type };

  switch (type) {
    case "headline":
      block.text = "Headline";
      block.level = 2;
      break;
    case "plainText":
      block.text = "Text";
      break;
    case "richText":
      block.html = "<p>Rich text</p>";
      break;
    case "image":
    case "panoramaImage":
      block.mediaUrl = "";
      block.width = 0;
      block.radius = 0;
      block.objectFit = "cover";
      if (type === "image") block.clickAction = "none";
      break;
    case "video":
    case "panoramaVideo":
      block.mediaUrl = "";
      block.controls = true;
      block.muted = true;
      break;
    case "videoEmbed":
      block.embedUrl = "";
      // 560 x 315 css pixels, the shape YouTube's own snippet uses, in rem.
      block.width = 35;
      block.height = 19.6875;
      break;
    case "icon":
      block.iconName = "Star";
      block.iconSize = 2;
      block.color = "#16181d";
      break;
    case "shape":
      block.shapeKind = "rectangle";
      block.color = "#2b6cb0";
      block.width = 12;
      block.height = 8;
      block.borderWidth = 0;
      block.borderColor = "#16181d";
      // No wording to begin with, so a new shape is just a shape.
      block.text = "";
      block.textPlacement = "inside";
      break;
    case "customShape":
      block.shapeSlug = "";
      block.color = "#2b6cb0";
      block.width = 12;
      block.height = 12;
      block.borderWidth = 0;
      block.borderColor = "#16181d";
      block.text = "";
      block.textPlacement = "inside";
      break;
    case "qrCode":
      block.qrValue = "https://example.com";
      block.width = 10;
      break;
    case "button":
      block.label = "Learn more";
      block.href = "/";
      break;
    case "container":
      block.container = normalizeContainerLayout({});
      break;
    default:
      break;
  }

  return block;
}

/**
 * What a row or column is born with on every side, in rem.
 *
 * Not zero, because a container with no padding puts its contents hard against
 * its own edge — and the edge only becomes visible later, when somebody gives
 * the row a background or a border and finds the text touching it. Half a rem
 * is small enough to be invisible until it is wanted and large enough to be
 * right when it is.
 *
 * Passed in at creation rather than built into `defaultSpacing`, which is also
 * the fallback normalization reads: baking it in there would silently repad
 * every row already saved with nothing.
 */
export const NEW_CONTAINER_PADDING = 0.5;

function paddedSpacing(padding: number | undefined) {
  if (padding === undefined) return defaultSpacing;
  return {
    ...defaultSpacing,
    paddingTop: padding,
    paddingRight: padding,
    paddingBottom: padding,
    paddingLeft: padding,
  };
}

export function createColumn(span = GRID_UNITS, padding?: number): PageColumn {
  return {
    id: makeId("col"),
    span,
    settings: { ...defaultColumnSettings, ...paddedSpacing(padding) },
    blocks: [],
  };
}

/** Divide the grid as evenly as possible, giving the remainder to the first columns. */
export function evenSpans(columnCount: number): number[] {
  const count = Math.max(1, Math.min(GRID_UNITS, columnCount));
  const base = Math.floor(GRID_UNITS / count);
  let remainder = GRID_UNITS - base * count;

  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

export function createRow(columnCount = 1, padding?: number): PageRow {
  const spans = evenSpans(columnCount);
  return {
    id: makeId("row"),
    settings: { ...defaultRowSettings, ...paddedSpacing(padding) },
    columns: spans.map((span) => createColumn(span, padding)),
  };
}

/** Re-divide a row's columns evenly; used when one is added or removed. */
export function rebalanceColumns(columns: PageColumn[]): PageColumn[] {
  const spans = evenSpans(columns.length);
  return columns.map((column, index) => ({ ...column, span: spans[index] }));
}

/* ----------------------------------------------------------- Normalization */

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * The image block's click action.
 *
 * Everything the chosen action does not use is cleared, so switching away from
 * a link and back cannot resurface a stale target, and a page never stores a
 * url alongside a collection id with no way to tell which one is meant.
 */
function normalizeImageClick(raw: any): Partial<PageBlock> {
  const clickAction = pick(raw?.clickAction, MEDIA_CLICK_ACTIONS, "none");
  if (clickAction !== "link") {
    return { clickAction, linkType: "page", linkPageId: "", linkCollectionId: "", linkHref: "", linkNewTab: false };
  }

  const linkType = pick(raw?.linkType, PAGE_LINK_TYPES, "page");
  return {
    clickAction,
    linkType,
    linkPageId: linkType === "page" ? str(raw?.linkPageId) : "",
    linkCollectionId: linkType === "collection" ? str(raw?.linkCollectionId) : "",
    linkHref: linkType === "url" ? str(raw?.linkHref) : "",
    linkNewTab: Boolean(raw?.linkNewTab),
  };
}

/**
 * A shape's label and the style slot that dresses it.
 *
 * Kept beside the two shape cases rather than in the shared preamble because
 * only they carry it — every other block reads `text` as its whole content.
 */
function normalizeShapeText(raw: Record<string, unknown>, block: PageBlock): void {
  block.text = str(raw.text);
  block.textPlacement = pick(raw.textPlacement, SHAPE_TEXT_PLACEMENTS, "inside");

  if (raw.shapeTextStyleSlug) block.shapeTextStyleSlug = str(raw.shapeTextStyleSlug);
  if (raw.shapeTextStyle) block.shapeTextStyle = normalizeStyleValues(raw.shapeTextStyle);
  normalizeResponsiveStyle(raw, block, "shapeTextStyle");
}

/**
 * Rows used to store `contentWidth: "contained" | "full"` plus a rem number.
 * Those are mapped onto the named scale so existing pages keep their layout.
 */
function normalizeRowWidth(raw: Record<string, unknown>): ContentWidth {
  if (CONTENT_WIDTHS.includes(raw.width as ContentWidth)) return raw.width as ContentWidth;
  if (raw.contentWidth === "full") return "full";

  const legacy = Number(raw.maxWidth);
  if (Number.isFinite(legacy) && legacy > 0) {
    if (legacy >= 88) return "wide";
    if (legacy <= 64) return "narrow";
  }
  return "standard";
}

function normalizeSpacing(raw: Record<string, unknown>, base: SpacingSettings): SpacingSettings {
  return {
    paddingTop: num(raw.paddingTop, base.paddingTop),
    paddingRight: num(raw.paddingRight, base.paddingRight),
    paddingBottom: num(raw.paddingBottom, base.paddingBottom),
    paddingLeft: num(raw.paddingLeft, base.paddingLeft),
    marginTop: num(raw.marginTop, base.marginTop),
    marginRight: num(raw.marginRight, base.marginRight),
    marginBottom: num(raw.marginBottom, base.marginBottom),
    marginLeft: num(raw.marginLeft, base.marginLeft),
  };
}

function normalizeBackground(raw: Record<string, unknown>): BackgroundSettings {
  return {
    backgroundType: pick(raw.backgroundType, BACKGROUND_TYPES, "none"),
    backgroundColor: str(raw.backgroundColor, defaultBackground.backgroundColor),
    backgroundOpacity: Math.min(1, Math.max(0, num(raw.backgroundOpacity, 1))),
    backgroundMediaUrl: sanitizeMediaPath(str(raw.backgroundMediaUrl)),
    /*
     * The fit used to be a raw `object-fit` value, and before that did not
     * exist — both of which behaved as `height` does now, so that is what they
     * migrate to and what an unstated fit falls back to. A background created
     * from `defaultBackground` states `width` explicitly, so new work still
     * gets the more useful default without rewriting existing pages.
     */
    backgroundFit: pick(
      raw.backgroundFit === "cover"
        ? "height"
        : raw.backgroundFit === "contain"
          ? "full"
          : raw.backgroundFit,
      BACKGROUND_FITS,
      "height"
    ),
    backgroundAspect: pick(raw.backgroundAspect, ASPECT_RATIOS, "16:9"),
    backgroundAlignX: pick(raw.backgroundAlignX, ["left", "center", "right"] as const, "center"),
    backgroundAlignY: pick(raw.backgroundAlignY, ["top", "center", "bottom"] as const, "center"),
    backgroundOverlay: str(raw.backgroundOverlay),
  };
}

function normalizeBorder(raw: Record<string, unknown>): BorderSettings {
  return {
    borderWidth: Math.max(0, num(raw.borderWidth, 0)),
    borderColor: str(raw.borderColor, defaultBorder.borderColor),
    borderRadius: Math.max(0, num(raw.borderRadius, 0)),
  };
}

export function normalizeBlock(
  input: unknown,
  /** Threaded into container cells so nested blocks are normalized too. */
  normalizeBlocksFn: BlocksNormalizer = normalizeBlocks
): PageBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type;
  if (!PAGE_BLOCK_TYPES.includes(type as PageBlockType)) return null;

  const block: PageBlock = {
    id: str(raw.id) || makeId("block"),
    type: type as PageBlockType,
  };

  if (raw.styleSlug) block.styleSlug = str(raw.styleSlug);
  if (raw.textStyle) block.textStyle = normalizeStyleValues(raw.textStyle);
  normalizeResponsiveStyle(raw, block, "textStyle");
  if (raw.align) block.align = pick(raw.align, ["left", "center", "right"] as const, "left");

  switch (block.type) {
    case "headline":
      block.text = str(raw.text);
      block.level = (Math.min(6, Math.max(1, num(raw.level, 2))) as PageBlock["level"]);
      break;
    case "plainText":
      block.text = str(raw.text);
      break;
    case "richText":
      block.html = normalizeRichText(str(raw.html));
      break;
    case "image":
    case "panoramaImage":
      block.mediaId = str(raw.mediaId);
      block.mediaUrl = sanitizeMediaPath(str(raw.mediaUrl));
      block.alt = str(raw.alt);
      block.caption = str(raw.caption);
      block.width = num(raw.width, 0);
      block.height = num(raw.height, 0);
      block.radius = num(raw.radius, 0);
      block.objectFit = pick(raw.objectFit, ["cover", "contain"] as const, "cover");
      // A panorama is dragged to look around, so a click action would fight
      // with it. Only the plain image block carries one.
      if (block.type === "image") Object.assign(block, normalizeImageClick(raw));
      break;
    case "video":
    case "panoramaVideo":
      block.mediaId = str(raw.mediaId);
      block.mediaUrl = sanitizeMediaPath(str(raw.mediaUrl));
      block.caption = str(raw.caption);
      block.width = num(raw.width, 0);
      block.height = num(raw.height, 0);
      block.radius = num(raw.radius, 0);
      block.autoplay = Boolean(raw.autoplay);
      block.loop = Boolean(raw.loop);
      block.muted = raw.muted === undefined ? true : Boolean(raw.muted);
      block.controls = raw.controls === undefined ? true : Boolean(raw.controls);
      break;
    case "icon":
      block.iconName = str(raw.iconName, "Star");
      block.iconSize = num(raw.iconSize, 2);
      block.color = str(raw.color, "#16181d");
      break;
    case "shape":
      block.shapeKind = pick(raw.shapeKind, SHAPE_KINDS, "rectangle");
      block.color = str(raw.color, "#2b6cb0");
      // Shapes always carry explicit dimensions so they cannot collapse.
      block.width = Math.max(0.25, num(raw.width, 12));
      block.height = Math.max(0.25, num(raw.height, 8));
      block.strokeWidth = num(raw.strokeWidth, 0.125);
      block.radius = num(raw.radius, 0);
      block.borderWidth = Math.max(0, num(raw.borderWidth, 0));
      block.borderColor = str(raw.borderColor, "#16181d");
      normalizeShapeText(raw, block);
      break;
    case "customShape":
      block.shapeSlug = str(raw.shapeSlug);
      block.color = str(raw.color, "#2b6cb0");
      block.width = Math.max(0.25, num(raw.width, 12));
      block.height = Math.max(0.25, num(raw.height, 12));
      block.borderWidth = Math.max(0, num(raw.borderWidth, 0));
      block.borderColor = str(raw.borderColor, "#16181d");
      normalizeShapeText(raw, block);
      break;
    case "videoEmbed":
      block.embedUrl = str(raw.embedUrl);
      block.width = num(raw.width, 35);
      block.height = num(raw.height, 19.6875);
      break;
    case "qrCode":
      block.qrValue = str(raw.qrValue);
      block.width = Math.max(2, num(raw.width, 10));
      block.color = str(raw.color, "#000000");
      break;
    case "button":
      block.label = str(raw.label, "Button");
      block.href = str(raw.href, "#");
      block.newTab = Boolean(raw.newTab);
      break;
    case "bio":
      block.bioId = str(raw.bioId);
      break;
    case "collection":
      block.collectionId = str(raw.collectionId);
      break;
    case "calendar":
      block.calendar = normalizeCalendarDisplay(raw.calendar);
      break;
    case "eventList":
      block.eventList = normalizeEventListSettings(raw.eventList);

      for (const slot of ["listStyle", "itemStyle"] as const) {
        const slugKey = `${slot}Slug` as const;
        if (raw[slugKey]) block[slugKey] = str(raw[slugKey]);
        if (raw[slot]) block[slot] = normalizeStyleValues(raw[slot]);
        // Kept beside the readers so a slot cannot be rendered from a key that
        // is never saved — the failure that works until the page reloads.
        normalizeResponsiveStyle(raw, block, slot);
      }
      break;
    case "form":
      block.formId = str(raw.formId);
      break;
    case "menu":
      block.menuId = str(raw.menuId);
      block.menuLayout = menuBlockLayout(raw.menuLayout);
      block.menuDirection = menuBlockDirection(raw.menuDirection);
      block.menuButtonText = str(raw.menuButtonText);
      break;
    case "container":
      // `normalizeContainerLayout` already runs the normalizer over every
      // cell's blocks. Running the plain one again here would drop the story
      // slots a story-bound container is allowed to hold.
      block.container = normalizeContainerLayout(raw.container, normalizeBlocksFn);
      break;
  }

  return block;
}

export function normalizeBlocks(input: unknown): PageBlock[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 200)
    // Threads itself so blocks nested in container cells are normalized too.
    // Passing the function reference directly would hand `map` the index as
    // the normalizer.
    .map((item) => normalizeBlock(item, normalizeBlocks))
    .filter((block): block is PageBlock => block !== null);
}

/**
 * Row and column normalization is shared with the form builder, which uses the
 * same row/column model but a different block vocabulary. `normalizeBlocksFn`
 * is the only difference between the two.
 */
export type BlocksNormalizer = (input: unknown) => any[];

/** The container's own settings: background, border and spacing, no alignment. */
export function normalizeContainerSettings(input: unknown): ContainerSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    ...normalizeSpacing(raw, defaultContainerSettings),
    ...normalizeBackground(raw),
    ...normalizeBorder(raw),
  };
}

/** Shared with container areas, which carry exactly the same settings. */
export function normalizeColumnSettings(input: unknown): ColumnSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    ...normalizeContainerSettings(raw),
    align: pick(raw.align, ["left", "center", "right"] as const, "left"),
    verticalAlign: pick(raw.verticalAlign, ["top", "center", "bottom"] as const, "top"),
  };
}

export function normalizeColumn(
  input: unknown,
  normalizeBlocksFn: BlocksNormalizer = normalizeBlocks
): PageColumn {
  const raw = (input ?? {}) as Record<string, unknown>;

  return {
    id: str(raw.id) || makeId("col"),
    span: Math.min(GRID_UNITS, Math.max(1, Math.round(num(raw.span, GRID_UNITS)))),
    settings: normalizeColumnSettings(raw.settings),
    blocks: normalizeBlocksFn(raw.blocks),
  };
}

export function normalizeRow(
  input: unknown,
  normalizeBlocksFn: BlocksNormalizer = normalizeBlocks
): PageRow {
  const raw = (input ?? {}) as Record<string, unknown>;
  const settingsRaw = (raw.settings ?? {}) as Record<string, unknown>;
  const columns = Array.isArray(raw.columns) ? raw.columns.slice(0, 12) : [];

  return {
    id: str(raw.id) || makeId("row"),
    settings: {
      ...normalizeSpacing(settingsRaw, defaultRowSettings),
      ...normalizeBackground(settingsRaw),
      ...normalizeBorder(settingsRaw),
      width: normalizeRowWidth(settingsRaw),
      align: pick(settingsRaw.align, ["left", "center", "right"] as const, "left"),
      verticalAlign: pick(
        settingsRaw.verticalAlign,
        ["top", "center", "bottom"] as const,
        "top"
      ),
      parallax: Boolean(settingsRaw.parallax),
    },
    columns:
      columns.length > 0
        ? columns.map((column) => normalizeColumn(column, normalizeBlocksFn))
        : [createColumn()],
  };
}

/** Entry point used by every save action and every renderer. */
export function normalizePageLayout(
  input: unknown,
  normalizeBlocksFn: BlocksNormalizer = normalizeBlocks
): PageLayout {
  if (!Array.isArray(input)) return [];
  // Bounded so a malformed payload cannot trigger an unbounded write.
  return input.slice(0, 200).map((row) => normalizeRow(row, normalizeBlocksFn));
}

/**
 * Depth-first walk that visits blocks inside nested container cells too.
 *
 * Lives here rather than beside the source loader so the builders — which are
 * client components — can walk their working layout without pulling Mongoose
 * into the browser bundle.
 */
export function walkBlocks(layout: PageLayout, visit: (block: PageBlock) => void) {
  const visitBlocks = (blocks: PageBlock[]) => {
    for (const block of blocks) {
      visit(block);
      if (block.type === "container" && block.container) {
        for (const cell of block.container.cells) {
          visitBlocks(cell.blocks as PageBlock[]);
        }
      }
    }
  };

  for (const row of layout) {
    for (const column of row.columns) visitBlocks(column.blocks);
  }
}

/* --------------------------------------------------------- Style resolvers */

export const ALIGN_TO_FLEX = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
} as const;

const ALIGN_TO_ITEMS = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
} as const;

function spacingStyle(settings: SpacingSettings): CSSProperties {
  return {
    paddingTop: `${settings.paddingTop}rem`,
    paddingRight: `${settings.paddingRight}rem`,
    paddingBottom: `${settings.paddingBottom}rem`,
    paddingLeft: `${settings.paddingLeft}rem`,
    marginTop: `${settings.marginTop}rem`,
    marginRight: `${settings.marginRight}rem`,
    marginBottom: `${settings.marginBottom}rem`,
    marginLeft: `${settings.marginLeft}rem`,
  };
}

function hexToRgba(color: string, opacity: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = match[1];
  return `rgba(${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(
    value.slice(4, 6),
    16
  )}, ${Math.max(0, Math.min(1, opacity))})`;
}

/**
 * The colour a row, column, container or area paints. Shared so the four cannot
 * drift apart. `site` follows Appearance — and any page-level override of it —
 * because it reads the same custom property the page body does.
 */
export function backgroundColorStyle(settings: BackgroundSettings): CSSProperties {
  if (settings.backgroundType === "site") return { backgroundColor: "var(--content-bg)" };
  if (settings.backgroundType !== "color") return {};
  return {
    backgroundColor: hexToRgba(settings.backgroundColor, settings.backgroundOpacity),
  };
}

/** Border and corner rounding, for anything carrying `BorderSettings`. */
export function borderStyle(settings: BorderSettings): CSSProperties {
  const style: CSSProperties = {};
  if (settings.borderWidth > 0) {
    style.borderStyle = "solid";
    style.borderWidth = `${settings.borderWidth}rem`;
    style.borderColor = settings.borderColor;
  }
  if (settings.borderRadius > 0) style.borderRadius = `${settings.borderRadius}rem`;
  return style;
}

export function rowStyle(row: PageRow): CSSProperties {
  // The row's own margins live on the full-width outer element; the inner
  // element uses its horizontal margin to centre itself.
  const style: CSSProperties = {
    marginTop: `${row.settings.marginTop}rem`,
    marginBottom: `${row.settings.marginBottom}rem`,
    marginLeft: `${row.settings.marginLeft}rem`,
    marginRight: `${row.settings.marginRight}rem`,
  };
  // The border goes on the same element as the background, as a column's
  // does — the row's visible box is the full-width one, and a border drawn
  // anywhere else would not agree with the colour behind it.
  Object.assign(
    style,
    backgroundColorStyle(row.settings),
    borderStyle(row.settings),
    backgroundBoxStyle(row.settings)
  );
  return style;
}

export function rowInnerStyle(row: PageRow): CSSProperties {
  const spacing = spacingStyle(row.settings);
  return {
    ...spacing,
    // `auto` on both sides centres the content within the page. The spacing
    // helper would otherwise emit `0rem` here and pin every row to the left.
    marginTop: 0,
    marginBottom: 0,
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: CONTENT_WIDTH_VALUES[row.settings.width] ?? CONTENT_WIDTH_VALUES.standard,
    alignItems: ALIGN_TO_FLEX[row.settings.verticalAlign],
    justifyContent: ALIGN_TO_ITEMS[row.settings.align],
  };
}

export function backgroundMediaStyle(settings: BackgroundSettings): CSSProperties {
  // Where the leftover space — or the crop — falls.
  const objectPosition = `${settings.backgroundAlignX} ${settings.backgroundAlignY}`;

  if (settings.backgroundFit === "width") {
    return {
      width: "100%",
      /*
       * `auto` is what lets the box grow: the media states the height its own
       * proportions call for at full width, and its layer — in flow for this
       * fit alone — passes that height on to the box. The minimum only bites
       * the other way round, keeping the media covering a box whose content
       * turned out taller than the media.
       */
      height: "auto",
      minHeight: "100%",
      objectFit: "cover",
      objectPosition,
    };
  }

  // The rest fill a box something else has already sized — the content, or the
  // ratio below — so their layer stays out of flow and the media spans it.
  return {
    width: "100%",
    height: "100%",
    objectFit: settings.backgroundFit === "full" ? "contain" : "cover",
    objectPosition,
  };
}

/**
 * What the background asks of the box itself, rather than of the media in it.
 *
 * Only the `aspect` fit has anything to say here: it holds the box to a ratio,
 * which is the one way an area can be given a shape without either its content
 * or its media deciding it.
 */
export function backgroundBoxStyle(settings: BackgroundSettings): CSSProperties {
  if (settings.backgroundFit !== "aspect") return {};
  const ratio = aspectRatioCss(settings.backgroundAspect);
  return ratio ? { aspectRatio: ratio } : {};
}

export function columnStyle(column: PageColumn): CSSProperties {
  const percent = (column.span / GRID_UNITS) * 100;
  const style: CSSProperties = {
    // Allowed to shrink but never to grow or wrap, so columns always share the
    // row even when their spans add up to more than the grid.
    flex: `0 1 ${percent}%`,
    maxWidth: `${percent}%`,
    minWidth: 0,
  };
  Object.assign(
    style,
    backgroundColorStyle(column.settings),
    borderStyle(column.settings),
    backgroundBoxStyle(column.settings)
  );
  return style;
}

/** The shape `blockFillsWidth` reads; satisfied by page blocks and story slots. */
export type WidthAwareBlock = {
  type: string;
  width?: number;
  mediaSize?: string;
  container?: { sizing?: string };
};

/**
 * Blocks whose own settings ask for the full width of their column.
 *
 * A column's alignment becomes `align-items`, which shrink-wraps every block in
 * it. A block sized at `100%` inside a shrink-wrapped box resolves that
 * percentage against a box that is itself only as wide as the content — so an
 * image narrower than the column stays at its natural size. These opt out of
 * the shrink-wrap instead.
 *
 * Text blocks are deliberately absent: shrink-wrapping is what makes their
 * left/centre/right placement control work.
 */
export function blockFillsWidth(block: WidthAwareBlock): boolean {
  // A form field is its column: there is no width control on one, and an input
  // shrunk to its label is not a form.
  if (isFieldBlock(block.type)) return true;

  switch (block.type) {
    case "image":
    case "panoramaImage":
    case "video":
    case "panoramaVideo":
      // `0` is how these blocks say "as wide as the column".
      return !block.width;
    case "storyFeatureMedia":
      return (block.mediaSize ?? "scaledWidth") === "scaledWidth";
    // No width control of their own, and nothing meaningful to shrink to.
    case "storyContent":
    case "collection":
    case "calendar":
    case "eventList":
    case "form":
    case "menu":
      return true;
    default:
      return false;
  }
}

export function columnInnerStyle(column: PageColumn): CSSProperties {
  return {
    ...spacingStyle(column.settings),
    // A column stacks its background layer and this element in one grid area,
    // so the vertical alignment of its blocks belongs here rather than on the
    // column, where `justify-content` would push things sideways instead.
    justifyContent: ALIGN_TO_FLEX[column.settings.verticalAlign],
    alignItems: ALIGN_TO_ITEMS[column.settings.align],
    textAlign: column.settings.align,
  };
}
