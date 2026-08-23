import { ASPECT_RATIOS, aspectRatioValue, type AspectRatio } from "./aspect-ratio";
import {
  COLLECTION_SLOT_BLOCK_TYPES,
  normalizeCollectionSlotBlock,
  type CollectionSlotBlock,
} from "./collection-slot-layout";
import {
  normalizeBlock,
  normalizePageLayout,
  makeId,
  type PageBlock,
  type PageRow,
} from "./page-layout";
import {
  normalizeResponsiveStyle,
  type ResponsiveStyleFields,
} from "./responsive-style";
import { normalizeStyleValues, type StyleValues } from "./style-values";

/**
 * Story templates are page layouts with extra blocks.
 *
 * The story blocks are *slots* rather than content: each names a field of the
 * story being rendered. Everything the page builder offers can sit alongside
 * them, so a template can carry its own headings, images and containers.
 *
 * Slot types are prefixed with `story` because a template holds page blocks too
 * and both vocabularies would otherwise claim `headline`.
 */

export const STORY_TEMPLATE_BLOCK_TYPES = [
  "storyHeadline",
  "storySubHeadline",
  "storyDate",
  "storyCategory",
  "storyLocation",
  "storyAuthor",
  "storyMeta",
  "storyFeatureMedia",
  "storyContent",
  "storyLink",
] as const;

export type StoryTemplateBlockType = (typeof STORY_TEMPLATE_BLOCK_TYPES)[number];

/**
 * How a feature image or video is sized.
 *
 * `full` leaves the media at its natural size; the other three drive one or
 * both axes, and pair with `mediaFit` and `mediaAspect` to decide what happens
 * to the frame when the box no longer matches the media's own proportions.
 */
export const STORY_MEDIA_SIZES = ["full", "scaledWidth", "scaledHeight", "custom"] as const;
export type StoryMediaSize = (typeof STORY_MEDIA_SIZES)[number];

/**
 * `actual` keeps the media's own proportions; the rest force a frame. Aliases of
 * the shared list, which background media uses too.
 */
export const STORY_MEDIA_ASPECTS = ASPECT_RATIOS;
export type StoryMediaAspect = AspectRatio;

export type StoryTemplateBlock = ResponsiveStyleFields & {
  id: string;
  type: StoryTemplateBlockType;
  styleSlug?: string;
  textStyle?: StyleValues;
  /** `storyMeta` blocks render these story fields inline, in this order. */
  metaFields?: string[];
  separator?: string;
  dateFormat?: "long" | "short" | "year";

  /* `storyFeatureMedia` */
  showCaption?: boolean;
  mediaSize?: StoryMediaSize;
  /** `fill` crops to the frame; `fit` shows all of the media inside it. */
  mediaFit?: "fit" | "fill";
  mediaAspect?: StoryMediaAspect;
  mediaWidth?: number; // rem
  mediaHeight?: number; // rem

  /* `storyLink` */
  linkText?: string;
  iconName?: string;
  iconSize?: number; // rem
  iconPlacement?: "before" | "after";
  iconStyleSlug?: string;
  iconStyle?: StyleValues;

  /**
   * Styles for the parts inside a block. The outer `styleSlug`/`textStyle`
   * above still dress the container; these dress what sits in it, so an image
   * and its caption can be styled independently.
   */
  imageStyleSlug?: string;
  imageStyle?: StyleValues;
  captionStyleSlug?: string;
  captionStyle?: StyleValues;

  /** `storyContent`: rem of space after each paragraph. 0 uses the default. */
  paragraphSpacing?: number;
};

/** The style slots a block can carry, beyond the container's own. */
export const STORY_STYLE_SLOTS = ["image", "caption", "icon"] as const;
export type StoryStyleSlot = (typeof STORY_STYLE_SLOTS)[number];

export { aspectRatioValue };

/** A template layout holds every kind of block a container can hold. */
export type TemplateBlock = StoryTemplateBlock | CollectionSlotBlock | PageBlock;

export const STORY_META_FIELDS = ["date", "category", "location", "author"] as const;

/**
 * Version 1 named the slots after the story fields alone. Templates saved then
 * are migrated on read; the version is stored on the document so a page block
 * legitimately called `headline` is never mistaken for the story's headline.
 */
export const STORY_TEMPLATE_LAYOUT_VERSION = 2;

const LEGACY_SLOT_TYPES: Record<string, StoryTemplateBlockType> = {
  headline: "storyHeadline",
  subHeadline: "storySubHeadline",
  date: "storyDate",
  category: "storyCategory",
  location: "storyLocation",
  author: "storyAuthor",
  meta: "storyMeta",
  featureMedia: "storyFeatureMedia",
  content: "storyContent",
};

export function isStoryTemplateBlock(block: { type: string }): block is StoryTemplateBlock {
  return (STORY_TEMPLATE_BLOCK_TYPES as readonly string[]).includes(block.type);
}

export function createStoryTemplateBlock(
  type: StoryTemplateBlockType
): StoryTemplateBlock {
  const block: StoryTemplateBlock = { id: makeId("stblock"), type };
  if (type === "storyMeta") {
    block.metaFields = [...STORY_META_FIELDS];
    block.separator = "·";
  }
  if (type === "storyDate") block.dateFormat = "long";
  if (type === "storyFeatureMedia") {
    block.showCaption = true;
    block.mediaSize = "scaledWidth";
    block.mediaFit = "fill";
    block.mediaAspect = "actual";
    block.mediaWidth = 24;
    block.mediaHeight = 16;
  }
  if (type === "storyLink") {
    block.linkText = "Read the story";
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

export function normalizeStoryTemplateBlock(input: unknown): StoryTemplateBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type as StoryTemplateBlockType;
  if (!STORY_TEMPLATE_BLOCK_TYPES.includes(type)) return null;

  const block: StoryTemplateBlock = { id: str(raw.id) || makeId("stblock"), type };

  if (raw.styleSlug) block.styleSlug = str(raw.styleSlug);
  if (raw.textStyle) block.textStyle = normalizeStyleValues(raw.textStyle);
  normalizeResponsiveStyle(raw, block, "textStyle");

  for (const slot of STORY_STYLE_SLOTS) {
    const slugKey = `${slot}StyleSlug` as const;
    const valuesKey = `${slot}Style` as const;
    if (raw[slugKey]) block[slugKey] = str(raw[slugKey]);
    if (raw[valuesKey]) block[valuesKey] = normalizeStyleValues(raw[valuesKey]);
    normalizeResponsiveStyle(raw, block, valuesKey);
  }

  if (type === "storyMeta") {
    block.metaFields = Array.isArray(raw.metaFields)
      ? raw.metaFields
          .map((field) => str(field))
          .filter((field) => (STORY_META_FIELDS as readonly string[]).includes(field))
      : [...STORY_META_FIELDS];
    block.separator = str(raw.separator, "·");
  }

  if (type === "storyDate") {
    block.dateFormat = (["long", "short", "year"] as const).includes(
      raw.dateFormat as "long"
    )
      ? (raw.dateFormat as StoryTemplateBlock["dateFormat"])
      : "long";
  }

  if (type === "storyFeatureMedia") {
    block.showCaption = raw.showCaption === undefined ? true : Boolean(raw.showCaption);

    // Blocks saved before the size controls existed filled their column, which
    // is what "scaled to width" means.
    block.mediaSize = STORY_MEDIA_SIZES.includes(raw.mediaSize as StoryMediaSize)
      ? (raw.mediaSize as StoryMediaSize)
      : "scaledWidth";
    block.mediaFit = raw.mediaFit === "fit" ? "fit" : "fill";
    block.mediaAspect = STORY_MEDIA_ASPECTS.includes(raw.mediaAspect as StoryMediaAspect)
      ? (raw.mediaAspect as StoryMediaAspect)
      : "actual";
    block.mediaWidth = positiveOr(raw.mediaWidth, 24);
    block.mediaHeight = positiveOr(raw.mediaHeight, 16);

    // `mediaRadius` predates per-part styling; carry it into the image style so
    // a rounded feature image stays rounded.
    const radius = Number(raw.mediaRadius);
    if (radius > 0 && !block.imageStyle && !block.imageStyleSlug) {
      block.imageStyle = normalizeStyleValues({ borderRadius: radius });
    }
  }

  if (type === "storyLink") {
    block.linkText = str(raw.linkText, "Read the story");
    block.iconName = str(raw.iconName);
    block.iconSize = positiveOr(raw.iconSize, 1);
    block.iconPlacement = raw.iconPlacement === "before" ? "before" : "after";
  }

  if (type === "storyContent") {
    const spacing = Number(raw.paragraphSpacing);
    block.paragraphSpacing = Number.isFinite(spacing) && spacing > 0 ? spacing : 0;
  }

  return block;
}

/**
 * Story slots keep their own normalizer; anything else falls through to the
 * page builder's, so both vocabularies survive a save unchanged.
 */
export function normalizeStoryTemplateBlocks(
  input: unknown,
  legacy = false
): TemplateBlock[] {
  if (!Array.isArray(input)) return [];

  return input
    .slice(0, 100)
    .map((raw): TemplateBlock | null => {
      const type = str((raw as Record<string, unknown>)?.type);
      const slotType = legacy ? (LEGACY_SLOT_TYPES[type] ?? type) : type;

      if ((STORY_TEMPLATE_BLOCK_TYPES as readonly string[]).includes(slotType)) {
        return normalizeStoryTemplateBlock({ ...(raw as object), type: slotType });
      }
      // A container can be bound to a collection as well as a story, so its
      // slots have to survive the same save.
      if ((COLLECTION_SLOT_BLOCK_TYPES as readonly string[]).includes(slotType)) {
        return normalizeCollectionSlotBlock(raw);
      }
      // Threaded so a container nested here keeps accepting story slots.
      return normalizeBlock(raw, (blocks) => normalizeStoryTemplateBlocks(blocks, legacy));
    })
    .filter((block): block is TemplateBlock => block !== null);
}

/**
 * The normalizer page layouts use: ordinary page blocks, plus the story slots a
 * story-bound container can hold.
 */
export function normalizeBlocksWithStorySlots(input: unknown): TemplateBlock[] {
  return normalizeStoryTemplateBlocks(input, false);
}

export function normalizeStoryTemplateLayout(
  input: unknown,
  /**
   * Required, and deliberately not defaulted: a stored template from before the
   * rename has no version field, so `undefined` has to mean "migrate" rather
   * than falling through to the current version.
   */
  version: number | undefined
): PageRow[] {
  const legacy = !Number.isFinite(version) || (version as number) < 2;
  return normalizePageLayout(input, (blocks) =>
    normalizeStoryTemplateBlocks(blocks, legacy)
  );
}

/**
 * The layout used when a story has no template and no default template exists.
 * Building it here (rather than in the renderer) keeps template and no-template
 * stories on exactly the same rendering path.
 */
export function defaultStoryTemplateLayout(): PageRow[] {
  return normalizeStoryTemplateLayout(
    [
      {
        id: "row-default",
        settings: {
          contentWidth: "contained",
          maxWidth: 46,
          paddingTop: 2.5,
          paddingBottom: 3,
        },
        columns: [
          {
            id: "col-default",
            span: 12,
            blocks: [
              { id: "b-headline", type: "storyHeadline" },
              { id: "b-sub", type: "storySubHeadline" },
              { id: "b-meta", type: "storyMeta" },
              { id: "b-feature", type: "storyFeatureMedia" },
              { id: "b-content", type: "storyContent" },
            ],
          },
        ],
      },
    ],
    STORY_TEMPLATE_LAYOUT_VERSION
  );
}
