import { makeId, SHAPE_TEXT_PLACEMENTS, type ShapeTextPlacement } from "./page-layout";
import { sanitizeMediaPath } from "./protected-media-url";
import { normalizeRichText } from "./rich-text";
import { normalizeStyleValues, type StyleValues } from "./style-values";

/**
 * Publications (zines, presentations and social posts) are fixed-canvas
 * designs: blocks are positioned in canvas units, and the viewer scales the
 * whole stage to the screen. Text sizes stay in rem so they scale with the
 * stage rather than jumping between breakpoints.
 */

export const PUBLICATION_KINDS = ["zine", "presentation", "post"] as const;
export type PublicationKind = (typeof PUBLICATION_KINDS)[number];

export const PUBLICATION_BLOCK_TYPES = [
  "text",
  "richText",
  "image",
  "video",
  "button",
  "qrCode",
  "icon",
  "shape",
  "customShape",
  "story",
  "collection",
  "form",
] as const;

export type PublicationBlockType = (typeof PUBLICATION_BLOCK_TYPES)[number];

export const TRANSITIONS = ["none", "fade", "slide", "flip"] as const;
export type Transition = (typeof TRANSITIONS)[number];

/** Preset canvases. Social posts carry several named views. */
export const PRESENTATION_SIZES = {
  "16:9": { width: 1920, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
  square: { width: 1080, height: 1080 },
  a4: { width: 1240, height: 1754 },
} as const;

export const POST_VIEW_PRESETS = [
  { id: "square", label: "Square", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait", width: 1080, height: 1350 },
  { id: "story", label: "Story", width: 1080, height: 1920 },
  { id: "landscape", label: "Landscape", width: 1200, height: 630 },
] as const;

export type PublicationBlock = {
  id: string;
  type: PublicationBlockType;

  /** Canvas units — the stage is scaled, these never change. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;

  styleSlug?: string;
  textStyle?: StyleValues;

  /**
   * Layout blocks only. A locked block is part of the layout: it shows on every
   * page using it and can only be changed on the layout itself. An unlocked one
   * is a starting point — applying the layout hands the page its own copy.
   */
  locked?: boolean;
  /** On a page's copy: the layout it came from, so switching layouts can tidy up. */
  fromTemplate?: string;
  /** Dresses a shape itself: its fill, outline, corners and shadow. */
  shapeStyle?: StyleValues;
  /**
   * Where a shape's text sits. `inside` is held to the shape's own outline, the
   * same as on a page; `above` puts it over the shape in the block's box. The
   * words themselves are `text`, styled by `textStyle` — so a shape and the
   * writing on it are dressed separately.
   */
  textPlacement?: ShapeTextPlacement;

  text?: string;
  html?: string;
  mediaId?: string;
  mediaUrl?: string;
  alt?: string;
  objectFit?: "cover" | "contain";
  radius?: number;

  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;

  label?: string;
  href?: string;
  newTab?: boolean;
  qrValue?: string;
  iconName?: string;
  color?: string;
  shapeKind?: string;
  shapeSlug?: string;

  storyId?: string;
  collectionId?: string;
  formId?: string;

  /** Click action for visual blocks: navigate, jump to a page, or nothing. */
  clickAction?: "none" | "link" | "page";
  clickTarget?: string;
};

/** The background settings a page and a layout both carry. */
export type PublicationBackground = {
  backgroundType: "none" | "color" | "image" | "video";
  backgroundColor: string;
  backgroundMediaUrl: string;
  backgroundFit: "cover" | "contain" | "fill";
  backgroundOffsetX: number;
  backgroundOffsetY: number;
  kenBurns: boolean;
  videoMuted: boolean;
  videoLoop: boolean;
};

export type PublicationPage = {
  id: string;
  name: string;
  backgroundType: "none" | "color" | "image" | "video";
  backgroundColor: string;
  backgroundMediaUrl: string;
  backgroundFit: "cover" | "contain" | "fill";
  backgroundOffsetX: number;
  backgroundOffsetY: number;
  kenBurns: boolean;
  videoMuted: boolean;
  videoLoop: boolean;
  audioUrl: string;
  blocks: PublicationBlock[];
  /** The page layout this page is built on, if any. */
  templateId: string;
  /** Per-view block overrides for social posts, keyed by view id. */
  viewOverrides: Record<string, Partial<PublicationBlock>[]>;
};

/**
 * A page layout, in the sense a presentation tool means it: a named set of
 * blocks that any number of pages are built on. The blocks belong to the
 * layout, so they are edited in one place and are read-only on the pages that
 * use it.
 */
export type PublicationPageTemplate = PublicationBackground & {
  id: string;
  name: string;
  blocks: PublicationBlock[];
};

export const emptyBackground: PublicationBackground = {
  // `none` so a layout without a background of its own leaves the page's alone.
  backgroundType: "none",
  backgroundColor: "#101317",
  backgroundMediaUrl: "",
  backgroundFit: "cover",
  backgroundOffsetX: 0,
  backgroundOffsetY: 0,
  kenBurns: false,
  videoMuted: true,
  videoLoop: true,
};

export function normalizeBackground(raw: Record<string, unknown>): PublicationBackground {
  return {
    backgroundType: pick(
      raw.backgroundType,
      ["none", "color", "image", "video"] as const,
      "none"
    ),
    backgroundColor: str(raw.backgroundColor, "#101317"),
    backgroundMediaUrl: sanitizeMediaPath(str(raw.backgroundMediaUrl)),
    backgroundFit: pick(raw.backgroundFit, ["cover", "contain", "fill"] as const, "cover"),
    backgroundOffsetX: num(raw.backgroundOffsetX, 0),
    backgroundOffsetY: num(raw.backgroundOffsetY, 0),
    kenBurns: Boolean(raw.kenBurns),
    videoMuted: raw.videoMuted === undefined ? true : Boolean(raw.videoMuted),
    videoLoop: raw.videoLoop === undefined ? true : Boolean(raw.videoLoop),
  };
}

export type SlideshowSettings = {
  enabled: boolean;
  intervalMs: number;
  loop: boolean;
};

export type AudioSettings = {
  url: string;
  loop: boolean;
  autoplay: boolean;
  volume: number;
};

export const defaultSlideshow: SlideshowSettings = {
  enabled: false,
  intervalMs: 6000,
  loop: true,
};

export const defaultAudio: AudioSettings = {
  url: "",
  loop: true,
  autoplay: false,
  volume: 0.8,
};

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

export function createPublicationBlock(type: PublicationBlockType): PublicationBlock {
  const block: PublicationBlock = {
    id: makeId("pubblock"),
    type,
    x: 80,
    y: 80,
    width: 480,
    height: 200,
    rotation: 0,
    zIndex: 1,
    clickAction: "none",
  };

  switch (type) {
    case "text":
      block.text = "Text";
      block.textStyle = { fontSize: 3, color: "#ffffff" };
      break;
    case "richText":
      block.html = "<p>Rich text</p>";
      break;
    case "button":
      block.label = "Open";
      block.href = "/";
      block.height = 80;
      block.width = 240;
      break;
    case "qrCode":
      block.qrValue = "https://example.com";
      block.width = 240;
      block.height = 240;
      break;
    case "icon":
      block.iconName = "Star";
      block.color = "#ffffff";
      block.width = 120;
      block.height = 120;
      break;
    case "shape":
      block.shapeKind = "rectangle";
      block.color = "#2b6cb0";
      block.text = "";
      block.textPlacement = "inside";
      break;
    case "customShape":
      block.shapeSlug = "";
      block.color = "#2b6cb0";
      block.text = "";
      block.textPlacement = "inside";
      break;
    default:
      break;
  }

  return block;
}

export function createPublicationPage(index = 0): PublicationPage {
  return {
    id: makeId("pubpage"),
    name: `Page ${index + 1}`,
    backgroundType: "color",
    backgroundColor: "#101317",
    backgroundMediaUrl: "",
    backgroundFit: "cover",
    backgroundOffsetX: 0,
    backgroundOffsetY: 0,
    kenBurns: false,
    videoMuted: true,
    videoLoop: true,
    audioUrl: "",
    blocks: [],
    templateId: "",
    viewOverrides: {},
  };
}

export function normalizePublicationBlock(input: unknown): PublicationBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type as PublicationBlockType;
  if (!PUBLICATION_BLOCK_TYPES.includes(type)) return null;

  const block: PublicationBlock = {
    id: str(raw.id) || makeId("pubblock"),
    type,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: Math.max(1, num(raw.width, 100)),
    height: Math.max(1, num(raw.height, 100)),
    rotation: num(raw.rotation, 0),
    zIndex: Math.round(num(raw.zIndex, 1)),
    clickAction: pick(raw.clickAction, ["none", "link", "page"] as const, "none"),
    clickTarget: str(raw.clickTarget),
  };

  if (raw.styleSlug) block.styleSlug = str(raw.styleSlug);
  // Absent means locked: a layout block belongs to the layout unless it has
  // been deliberately opened up.
  if (raw.locked !== undefined) block.locked = Boolean(raw.locked);
  if (raw.fromTemplate) block.fromTemplate = str(raw.fromTemplate);
  if (raw.textStyle) block.textStyle = normalizeStyleValues(raw.textStyle);
  if (raw.shapeStyle) block.shapeStyle = normalizeStyleValues(raw.shapeStyle);

  switch (type) {
    case "text":
      block.text = str(raw.text);
      break;
    case "richText":
      block.html = normalizeRichText(str(raw.html));
      break;
    case "image":
    case "video":
      block.mediaId = str(raw.mediaId);
      block.mediaUrl = sanitizeMediaPath(str(raw.mediaUrl));
      block.alt = str(raw.alt);
      block.objectFit = pick(raw.objectFit, ["cover", "contain"] as const, "cover");
      block.radius = num(raw.radius, 0);
      block.autoplay = Boolean(raw.autoplay);
      block.loop = raw.loop === undefined ? true : Boolean(raw.loop);
      block.muted = raw.muted === undefined ? true : Boolean(raw.muted);
      block.controls = Boolean(raw.controls);
      break;
    case "button":
      block.label = str(raw.label, "Button");
      block.href = str(raw.href, "#");
      block.newTab = Boolean(raw.newTab);
      break;
    case "qrCode":
      block.qrValue = str(raw.qrValue);
      block.color = str(raw.color, "#000000");
      break;
    case "icon":
      block.iconName = str(raw.iconName, "Star");
      block.color = str(raw.color, "#ffffff");
      break;
    case "shape":
      block.shapeKind = str(raw.shapeKind, "rectangle");
      block.color = str(raw.color, "#2b6cb0");
      block.radius = num(raw.radius, 0);
      // Words on the shape, with their own style and their own placement.
      block.text = str(raw.text);
      block.textPlacement = pick(raw.textPlacement, SHAPE_TEXT_PLACEMENTS, "inside");
      break;
    case "customShape":
      block.shapeSlug = str(raw.shapeSlug);
      block.color = str(raw.color, "#2b6cb0");
      block.text = str(raw.text);
      block.textPlacement = pick(raw.textPlacement, SHAPE_TEXT_PLACEMENTS, "inside");
      break;
    case "story":
      block.storyId = str(raw.storyId);
      break;
    case "collection":
      block.collectionId = str(raw.collectionId);
      break;
    case "form":
      block.formId = str(raw.formId);
      break;
  }

  return block;
}

/**
 * Earlier versions stored a page as `{ background, backgrounds, layouts }`,
 * where `layouts` mapped a view id to an array of blocks using `x/y/w/h/z` and
 * `content`/`sourceId`. This maps that shape onto the current model so existing
 * publications keep their content instead of rendering as empty pages.
 */
function migrateLegacyPage(raw: Record<string, unknown>): {
  blocks: unknown[];
  background: Partial<PublicationPage>;
} {
  const layouts = (raw.layouts ?? {}) as Record<string, unknown[]>;
  const viewIds = Object.keys(layouts);
  // Prefer the primary desktop layout; otherwise take the first non-empty view.
  const chosenView =
    viewIds.find((id) => id === "desktop-landscape" && layouts[id]?.length) ??
    viewIds.find((id) => Array.isArray(layouts[id]) && layouts[id].length > 0) ??
    viewIds[0];

  const legacyBlocks = Array.isArray(layouts[chosenView]) ? layouts[chosenView] : [];

  const blocks = legacyBlocks
    .filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object")
    .filter((block) => !block.hidden)
    .map((block) => {
      const type = String(block.type ?? "");
      const mapped: Record<string, unknown> = {
        id: block.id,
        type: type === "pageNumber" ? "text" : type,
        x: block.x,
        y: block.y,
        width: block.w,
        height: block.h,
        zIndex: block.z,
        rotation: 0,
      };

      if (type === "richText") mapped.html = block.content;
      else if (type === "qrCode") mapped.qrValue = block.content;
      else if (type === "button") mapped.label = block.content;
      else if (type === "pageNumber") mapped.text = "";
      else mapped.text = block.content;

      // `sourceId` addressed a media asset, a story, a collection or a form
      // depending on the block type.
      if (block.sourceId) {
        if (type === "story") mapped.storyId = block.sourceId;
        else if (type === "collection") mapped.collectionId = block.sourceId;
        else if (type === "form") mapped.formId = block.sourceId;
        else mapped.mediaId = block.sourceId;
      }

      if (block.color) mapped.color = block.color;
      if (block.shapeKind) mapped.shapeKind = block.shapeKind;
      if (block.shapeSlug) mapped.shapeSlug = block.shapeSlug;

      // Font settings were stored as pixels; StyleValues is rem-based.
      const textStyle: Record<string, unknown> = {};
      if (typeof block.fontSize === "number") textStyle.fontSize = block.fontSize / 16;
      if (block.fontFamily && block.fontFamily !== "classic") {
        textStyle.fontFamily = block.fontFamily;
      }
      if (block.fontWeight) textStyle.fontWeight = block.fontWeight;
      if (block.color) textStyle.color = block.color;
      if (Object.keys(textStyle).length > 0) mapped.textStyle = textStyle;

      if (block.linkTarget === "url" && block.linkUrl && block.linkUrl !== "https://") {
        mapped.clickAction = "link";
        mapped.clickTarget = block.linkUrl;
      } else if (block.linkTarget === "page" && block.linkPageId) {
        mapped.clickAction = "page";
        mapped.clickTarget = block.linkPageId;
      }

      return mapped;
    });

  const backgrounds = (raw.backgrounds ?? {}) as Record<string, Record<string, unknown>>;
  const background =
    backgrounds[chosenView] ??
    backgrounds["desktop-landscape"] ??
    Object.values(backgrounds)[0];

  const settings: Partial<PublicationPage> = {};

  if (background?.url) {
    settings.backgroundType = background.mediaType === "video" ? "video" : "image";
    settings.backgroundMediaUrl = sanitizeMediaPath(String(background.url));
    settings.backgroundFit = pick(
      background.fit,
      ["cover", "contain", "fill"] as const,
      "cover"
    );
    settings.backgroundOffsetX = num(background.offsetX, 0);
    settings.backgroundOffsetY = num(background.offsetY, 0);
    settings.kenBurns = Boolean(background.kenBurns);
    settings.videoLoop = background.loopVideo !== false;
  } else if (typeof raw.background === "string" && raw.background) {
    settings.backgroundType = "color";
    settings.backgroundColor = raw.background;
  }

  const audio = raw.audio as Record<string, unknown> | undefined;
  if (audio?.url) settings.audioUrl = sanitizeMediaPath(String(audio.url));

  return { blocks, background: settings };
}

export function normalizePublicationPage(input: unknown, index: number): PublicationPage {
  const raw = { ...((input ?? {}) as Record<string, unknown>) };

  // Legacy documents carry `layouts` instead of `blocks`.
  let blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  if (blocks.length === 0 && raw.layouts && typeof raw.layouts === "object") {
    const migrated = migrateLegacyPage(raw);
    blocks = migrated.blocks;
    Object.assign(raw, migrated.background);
    if (raw.title && !raw.name) raw.name = raw.title;
  }

  return {
    id: str(raw.id) || makeId("pubpage"),
    name: str(raw.name, `Page ${index + 1}`),
    backgroundType: pick(
      raw.backgroundType,
      ["none", "color", "image", "video"] as const,
      "color"
    ),
    backgroundColor: str(raw.backgroundColor, "#101317"),
    backgroundMediaUrl: sanitizeMediaPath(str(raw.backgroundMediaUrl)),
    backgroundFit: pick(raw.backgroundFit, ["cover", "contain", "fill"] as const, "cover"),
    backgroundOffsetX: num(raw.backgroundOffsetX, 0),
    backgroundOffsetY: num(raw.backgroundOffsetY, 0),
    kenBurns: Boolean(raw.kenBurns),
    videoMuted: raw.videoMuted === undefined ? true : Boolean(raw.videoMuted),
    videoLoop: raw.videoLoop === undefined ? true : Boolean(raw.videoLoop),
    audioUrl: sanitizeMediaPath(str(raw.audioUrl)),
    blocks: blocks
      .slice(0, 300)
      .map(normalizePublicationBlock)
      .filter((block): block is PublicationBlock => block !== null),
    templateId: str(raw.templateId),
    viewOverrides:
      raw.viewOverrides && typeof raw.viewOverrides === "object"
        ? (raw.viewOverrides as PublicationPage["viewOverrides"])
        : {},
  };
}

export function normalizePublicationPages(input: unknown): PublicationPage[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 300).map(normalizePublicationPage);
}

/** Blocks drawn on every page, beneath the page's own blocks. */
export function normalizeRepeatedBlocks(input: unknown): PublicationBlock[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 100)
    .map(normalizePublicationBlock)
    .filter((block): block is PublicationBlock => block !== null);
}

/** Page layouts, each with its own blocks. */
export function normalizePageTemplates(input: unknown): PublicationPageTemplate[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      ...normalizeBackground(item),
      id: str(item.id) || makeId("pubtpl"),
      name: str(item.name, `Layout ${index + 1}`),
      blocks: Array.isArray(item.blocks)
        ? item.blocks
            .slice(0, 300)
            .map(normalizePublicationBlock)
            .filter((block): block is PublicationBlock => block !== null)
        : [],
    };
  });
}

/**
 * Everything drawn on a page beneath its own blocks: the publication's repeated
 * blocks, then the blocks of whatever layout the page uses. One helper so the
 * editor canvas, the viewer and the export cannot disagree about what a page
 * contains.
 */
export function inheritedBlocks(
  page: PublicationPage,
  repeatedBlocks: PublicationBlock[],
  templates: PublicationPageTemplate[]
): PublicationBlock[] {
  const template = page.templateId
    ? templates.find((item) => item.id === page.templateId)
    : undefined;

  // Only the locked ones are inherited. An unlocked layout block was copied
  // onto the page when the layout was applied, and the page owns that copy —
  // drawing the layout's as well would show it twice.
  const fromLayout = (template?.blocks ?? []).filter((block) => block.locked !== false);
  return [...repeatedBlocks, ...fromLayout];
}

/** The layout a page is built on, if it has one. */
export function pageTemplateOf(
  page: PublicationPage,
  templates: PublicationPageTemplate[]
): PublicationPageTemplate | undefined {
  return page.templateId
    ? templates.find((item) => item.id === page.templateId)
    : undefined;
}

/**
 * Which background a page shows: its own when it sets one, otherwise its
 * layout's. A page keeps the last word — a layout is a starting point, not a
 * rule — and a page set to `none` is asking for the layout's.
 */
export function effectiveBackground(
  page: PublicationPage,
  templates: PublicationPageTemplate[]
): PublicationBackground {
  if (page.backgroundType !== "none") return page;
  const template = pageTemplateOf(page, templates);
  return template && template.backgroundType !== "none" ? template : page;
}

/**
 * The blocks a page gets to keep when a layout is applied: a copy of each
 * unlocked block, marked with the layout it came from so switching layouts can
 * take the old ones away again.
 */
export function templateStarterBlocks(
  template: PublicationPageTemplate
): PublicationBlock[] {
  return template.blocks
    .filter((block) => block.locked === false)
    .map((block, index) => ({
      ...block,
      id: `${block.id}-${template.id}-${index}`,
      locked: undefined,
      fromTemplate: template.id,
    }));
}

/** Applies a layout to a page: fresh copies in, previous layout's copies out. */
export function withTemplateApplied(
  page: PublicationPage,
  templateId: string,
  templates: PublicationPageTemplate[]
): PublicationPage {
  const template = templates.find((item) => item.id === templateId);
  const kept = page.blocks.filter((block) => !block.fromTemplate);
  return {
    ...page,
    templateId,
    // Stand aside so the layout's background shows; a page that wants its own
    // back only has to set one.
    backgroundType:
      template && template.backgroundType !== "none" ? "none" : page.backgroundType,
    blocks: template ? [...templateStarterBlocks(template), ...kept] : kept,
  };
}

export function normalizeSlideshow(input: unknown): SlideshowSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(raw.enabled),
    intervalMs: Math.max(500, num(raw.intervalMs, defaultSlideshow.intervalMs)),
    loop: raw.loop === undefined ? true : Boolean(raw.loop),
  };
}

export function normalizeAudio(input: unknown): AudioSettings {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    url: sanitizeMediaPath(str(raw.url)),
    loop: raw.loop === undefined ? true : Boolean(raw.loop),
    autoplay: Boolean(raw.autoplay),
    volume: Math.min(1, Math.max(0, num(raw.volume, 0.8))),
  };
}

export function normalizeCanvasSize(input: unknown): { width: number; height: number } {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    width: Math.max(100, Math.round(num(raw.width, 1920))),
    height: Math.max(100, Math.round(num(raw.height, 1080))),
  };
}

/** Public route for a publication, based on its kind. */
export function publicationHref(kind: PublicationKind, slug: string): string {
  if (kind === "presentation") return `/present/${slug}`;
  if (kind === "post") return `/post/${slug}`;
  return `/zines/${slug}`;
}
