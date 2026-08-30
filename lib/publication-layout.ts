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

  /**
   * Blocks arranged together, moved and selected as one.
   *
   * Held on each block rather than as a list on the page: a block carries its
   * own membership, so copying, deleting or reordering one cannot leave a
   * group naming something that is no longer there.
   */
  groupId?: string;

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
  /**
   * Superseded by `clickAction` and `clickTarget`.
   *
   * Kept on the type so a publication saved before the change still reads, and
   * carried over to a click action the first time it is normalized. Never
   * written, and never rendered.
   */
  href?: string;
  /** Whether a click action's link opens in a new tab. */
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
  /**
   * Whether it starts by itself.
   *
   * Separate from `enabled`, which only says the publication *can* advance on
   * its own. A reader who opened a zine to look at it should not have it taken
   * off them a few seconds later, so the pages move when they press play —
   * unless whoever published it decided otherwise.
   */
  autoplay: boolean;
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
  autoplay: false,
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

  if (raw.groupId) block.groupId = str(raw.groupId);
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
      block.newTab = Boolean(raw.newTab);
      /*
       * A link set on the button itself, carried over to the click action.
       *
       * `href` was the button's own field and nothing ever rendered it: a
       * button block draws a label, and what a block does when it is pressed
       * has always been the click action, which every block carries. So a
       * button with a link stored on it was a button that did nothing. The
       * address is moved rather than dropped, and only where nothing has been
       * asked for already, so a click action somebody set is never overruled.
       */
      if (!block.clickAction || block.clickAction === "none") {
        const legacy = str(raw.href);
        if (legacy && legacy !== "#") {
          block.clickAction = "link";
          block.clickTarget = legacy;
        }
      }
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

/**
 * Stands the pages using a layout aside, so the layout's background shows.
 *
 * Every page is created carrying a background of its own, and a page's own
 * background wins — which is right, but it meant a background given to a
 * layout after the layout had been applied could never appear: each page was
 * still claiming the colour it was born with. Applying a layout already does
 * exactly this; doing it when the background arrives is the same rule reaching
 * the other order of work.
 *
 * A page that wants its own back only has to set one, as before.
 */
export function withLayoutBackground(
  pages: PublicationPage[],
  templateId: string
): PublicationPage[] {
  return pages.map((page) =>
    page.templateId === templateId ? { ...page, backgroundType: "none" } : page
  );
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
    // Unsaid means no. A slideshow saved before this existed started on its
    // own, and the point of the setting is that it should not have.
    autoplay: Boolean(raw.autoplay),
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

/* ------------------------------------------------------------- Arranging */

/**
 * Lining several blocks up, and spacing them out.
 *
 * Pure, and kept here rather than in the editor, because "align these left"
 * has exactly one right answer and it is arithmetic — the editor should be
 * able to hand over a selection and get the same result every time, and a
 * reader should be able to check the rule without reading a component.
 *
 * Rotation is deliberately ignored: a block's `x`, `y`, `width` and `height`
 * describe its unrotated box, which is what its handles and its stored
 * position both mean. Aligning by the corners of a turned block would move a
 * block that already looked aligned.
 */

export const ALIGNMENTS = [
  "left",
  "centre",
  "right",
  "top",
  "middle",
  "bottom",
] as const;

export type Alignment = (typeof ALIGNMENTS)[number];

export const ALIGNMENT_LABELS: Record<Alignment, string> = {
  left: "Left",
  centre: "Centre",
  right: "Right",
  top: "Top",
  middle: "Middle",
  bottom: "Bottom",
};

/** The box a set of blocks occupies together. */
export function boundsOf(blocks: PublicationBlock[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (blocks.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const left = Math.min(...blocks.map((block) => block.x));
  const top = Math.min(...blocks.map((block) => block.y));
  const right = Math.max(...blocks.map((block) => block.x + block.width));
  const bottom = Math.max(...blocks.map((block) => block.y + block.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Lines the chosen blocks up against each other, or against the page.
 *
 * Against each other, the edge they meet at is the outermost one already in
 * use — aligning left moves everything to the leftmost block rather than to
 * some new place, so one block stays where it was and the arrangement is
 * recognisably the same arrangement.
 */
export function alignBlocks(
  blocks: PublicationBlock[],
  ids: string[],
  alignment: Alignment,
  against: { x: number; y: number; width: number; height: number }
): PublicationBlock[] {
  const chosen = new Set(ids);

  return blocks.map((block) => {
    if (!chosen.has(block.id)) return block;

    switch (alignment) {
      case "left":
        return { ...block, x: Math.round(against.x) };
      case "centre":
        return {
          ...block,
          x: Math.round(against.x + (against.width - block.width) / 2),
        };
      case "right":
        return { ...block, x: Math.round(against.x + against.width - block.width) };
      case "top":
        return { ...block, y: Math.round(against.y) };
      case "middle":
        return {
          ...block,
          y: Math.round(against.y + (against.height - block.height) / 2),
        };
      case "bottom":
        return { ...block, y: Math.round(against.y + against.height - block.height) };
    }
  });
}

/**
 * Spreads the chosen blocks evenly between the two at the ends.
 *
 * The outermost two do not move — they are what "between" means — and the
 * gaps between the rest are made equal. Gaps rather than centres, so blocks of
 * different sizes end up evenly *spaced* rather than evenly *pitched*, which
 * is what somebody spacing things out is looking at.
 *
 * Fewer than three blocks has no middle to move, so nothing happens.
 */
export function distributeBlocks(
  blocks: PublicationBlock[],
  ids: string[],
  axis: "horizontal" | "vertical"
): PublicationBlock[] {
  const chosen = blocks.filter((block) => ids.includes(block.id));
  if (chosen.length < 3) return blocks;

  const size = (block: PublicationBlock) =>
    axis === "horizontal" ? block.width : block.height;
  const start = (block: PublicationBlock) =>
    axis === "horizontal" ? block.x : block.y;

  const ordered = [...chosen].sort((a, b) => start(a) - start(b));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  const span = start(last) + size(last) - start(first);
  const filled = ordered.reduce((total, block) => total + size(block), 0);
  // A negative gap means they overlap; spreading them is still the right
  // answer, and the overlap is simply shared out evenly.
  const gap = (span - filled) / (ordered.length - 1);

  const placed = new Map<string, number>();
  let cursor = start(first);
  for (const block of ordered) {
    placed.set(block.id, Math.round(cursor));
    cursor += size(block) + gap;
  }

  return blocks.map((block) => {
    const at = placed.get(block.id);
    if (at === undefined) return block;
    return axis === "horizontal" ? { ...block, x: at } : { ...block, y: at };
  });
}

/** Every block that moves when one of these does: the selection, plus groups. */
export function withGroupMembers(
  blocks: PublicationBlock[],
  ids: string[]
): string[] {
  const groups = new Set(
    blocks
      .filter((block) => ids.includes(block.id) && block.groupId)
      .map((block) => block.groupId)
  );
  if (groups.size === 0) return [...new Set(ids)];

  return [
    ...new Set([
      ...ids,
      ...blocks
        .filter((block) => block.groupId && groups.has(block.groupId))
        .map((block) => block.id),
    ]),
  ];
}

/* ------------------------------------------------------- Copying a look */

/**
 * How a block is dressed, apart from what it is and where it sits.
 *
 * Its style, its shape's style, the slugs of any saved styles it wears, the
 * colour an icon or a code is drawn in, and how a picture is cropped and
 * cornered. Deliberately not its text, its media, its size or its position:
 * copying a look onto another block should leave that block being what it is
 * and standing where it stood.
 */
export type BlockStyle = Pick<
  PublicationBlock,
  | "styleSlug"
  | "textStyle"
  | "shapeSlug"
  | "shapeStyle"
  | "textPlacement"
  | "color"
  | "radius"
  | "objectFit"
>;

const BLOCK_STYLE_KEYS = [
  "styleSlug",
  "textStyle",
  "shapeSlug",
  "shapeStyle",
  "textPlacement",
  "color",
  "radius",
  "objectFit",
] as const;

export function blockStyleOf(block: PublicationBlock): BlockStyle {
  const style: BlockStyle = {};
  for (const key of BLOCK_STYLE_KEYS) {
    const value = block[key];
    if (value !== undefined) {
      // The cast is the price of copying a fixed set of keys off one object
      // onto another of the same shape; every key is checked above.
      (style as Record<string, unknown>)[key] = value;
    }
  }
  return style;
}

/**
 * Dresses a block in a look taken from another.
 *
 * Every style key is written, including the ones the copied block did not
 * have: a look pasted onto a block that already had one has to be able to
 * clear what was there, or pasting a plain style onto a decorated block would
 * leave the decoration behind and match neither.
 *
 * A key the target's type does not use is dropped the next time it is read —
 * `normalizePublicationBlock` writes only the fields each type has — so a text
 * colour pasted onto a photograph does not linger.
 */
export function withBlockStyle(
  block: PublicationBlock,
  style: BlockStyle
): PublicationBlock {
  const dressed: PublicationBlock = { ...block };
  for (const key of BLOCK_STYLE_KEYS) {
    if (style[key] === undefined) delete (dressed as Record<string, unknown>)[key];
    else (dressed as Record<string, unknown>)[key] = style[key];
  }
  return dressed;
}
