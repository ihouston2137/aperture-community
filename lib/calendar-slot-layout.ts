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
 * Calendar layout templates are page layouts with extra blocks.
 *
 * The calendar blocks are *slots* rather than content: each names a field of
 * the event being rendered. Everything the page builder offers can sit
 * alongside them, so a template can carry its own headings, shapes, icons and
 * containers — the same arrangement story templates use.
 *
 * Slot types are prefixed with `cal` because a template holds page blocks too,
 * and both vocabularies would otherwise claim `location`.
 */

export const CALENDAR_SLOT_BLOCK_TYPES = [
  "calName",
  "calDate",
  "calTime",
  "calLocation",
  "calDescription",
  "calCategory",
  "calWho",
  "calTags",
  "calLink",
] as const;

export type CalendarSlotBlockType = (typeof CALENDAR_SLOT_BLOCK_TYPES)[number];

export const CALENDAR_SLOT_LABELS: Record<CalendarSlotBlockType, string> = {
  calName: "Event name",
  calDate: "Event date",
  calTime: "Event time",
  calLocation: "Event location",
  calDescription: "Event description",
  calCategory: "Event category",
  calWho: "Event who",
  calTags: "Event tags",
  calLink: "Event link",
};

/** A recognisable glyph for each slot, shown above its name in the palette. */
export const CALENDAR_SLOT_ICONS: Record<CalendarSlotBlockType, string> = {
  calName: "Heading",
  calDate: "CalendarDays",
  calTime: "Clock",
  calLocation: "MapPin",
  calDescription: "Pilcrow",
  calCategory: "Folder",
  calWho: "Users",
  calTags: "Tags",
  calLink: "Link",
};

export type CalendarSlotBlock = ResponsiveStyleFields & {
  id: string;
  type: CalendarSlotBlockType;
  styleSlug?: string;
  textStyle?: StyleValues;

  /** Printed before the value, e.g. `Where:`. Empty prints nothing. */
  label?: string;

  /** `calTime`: the whole range, or just when it starts. */
  timeFormat?: "range" | "start" | "end";
  /** `calDate`. */
  dateFormat?: "long" | "short" | "weekday" | "day";
  /** `calWho` and `calTags`: run together, or one chip each. */
  asChips?: boolean;
  separator?: string;
  /** `calLink`: used when the event names no link text of its own. */
  fallbackText?: string;
  newTab?: boolean;
};

export function isCalendarSlotBlock(block: {
  type: string;
}): block is CalendarSlotBlock {
  return (CALENDAR_SLOT_BLOCK_TYPES as readonly string[]).includes(block.type);
}

export function createCalendarSlotBlock(
  type: CalendarSlotBlockType
): CalendarSlotBlock {
  const block: CalendarSlotBlock = { id: makeId("calblock"), type };

  if (type === "calTime") block.timeFormat = "range";
  if (type === "calDate") block.dateFormat = "long";
  if (type === "calWho" || type === "calTags") {
    block.asChips = true;
    block.separator = ", ";
  }
  if (type === "calLink") {
    block.fallbackText = "More details";
    block.newTab = true;
  }
  return block;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function normalizeCalendarSlotBlock(input: unknown): CalendarSlotBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type as CalendarSlotBlockType;
  if (!CALENDAR_SLOT_BLOCK_TYPES.includes(type)) return null;

  const block: CalendarSlotBlock = { id: str(raw.id) || makeId("calblock"), type };

  if (raw.styleSlug) block.styleSlug = str(raw.styleSlug);
  if (raw.textStyle) block.textStyle = normalizeStyleValues(raw.textStyle);
  normalizeResponsiveStyle(raw, block, "textStyle");

  block.label = str(raw.label);

  if (type === "calTime") {
    block.timeFormat = (["range", "start", "end"] as const).includes(
      raw.timeFormat as "range"
    )
      ? (raw.timeFormat as CalendarSlotBlock["timeFormat"])
      : "range";
  }

  if (type === "calDate") {
    block.dateFormat = (["long", "short", "weekday", "day"] as const).includes(
      raw.dateFormat as "long"
    )
      ? (raw.dateFormat as CalendarSlotBlock["dateFormat"])
      : "long";
  }

  if (type === "calWho" || type === "calTags") {
    block.asChips = raw.asChips === undefined ? true : Boolean(raw.asChips);
    block.separator = str(raw.separator, ", ");
  }

  if (type === "calLink") {
    block.fallbackText = str(raw.fallbackText, "More details");
    block.newTab = raw.newTab === undefined ? true : Boolean(raw.newTab);
  }

  return block;
}

/**
 * Calendar slots keep their own normalizer; anything else falls through to the
 * page builder's, so both vocabularies survive a save unchanged.
 */
export function normalizeCalendarTemplateBlocks(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];

  return input
    .slice(0, 100)
    .map((raw) => {
      const type = str((raw as Record<string, unknown>)?.type);
      if ((CALENDAR_SLOT_BLOCK_TYPES as readonly string[]).includes(type)) {
        return normalizeCalendarSlotBlock(raw);
      }
      // Threaded so a container nested here keeps accepting calendar slots.
      return normalizeBlock(raw, normalizeCalendarTemplateBlocks as never);
    })
    .filter((block): block is NonNullable<typeof block> => block !== null);
}

export function normalizeCalendarTemplateLayout(input: unknown): PageRow[] {
  return normalizePageLayout(input, normalizeCalendarTemplateBlocks as never);
}

/** The starting arrangement for a new event-box template. */
export function defaultEventTemplateLayout(): PageRow[] {
  return normalizeCalendarTemplateLayout([
    {
      id: "row-event",
      settings: { contentWidth: "full", paddingTop: 0.4, paddingBottom: 0.4 },
      columns: [
        {
          id: "col-event-time",
          span: 3,
          blocks: [{ id: "b-time", type: "calTime" }],
        },
        {
          id: "col-event-body",
          span: 6,
          blocks: [
            { id: "b-name", type: "calName" },
            { id: "b-location", type: "calLocation" },
            { id: "b-description", type: "calDescription" },
          ],
        },
        {
          id: "col-event-meta",
          span: 3,
          blocks: [
            { id: "b-category", type: "calCategory" },
            { id: "b-who", type: "calWho" },
            { id: "b-tags", type: "calTags" },
          ],
        },
      ],
    },
  ]);
}

/** The starting arrangement for a new lightbox template. */
export function defaultLightboxTemplateLayout(): PageRow[] {
  return normalizeCalendarTemplateLayout([
    {
      id: "row-lightbox",
      settings: { contentWidth: "contained", maxWidth: 34, paddingTop: 1, paddingBottom: 1 },
      columns: [
        {
          id: "col-lightbox",
          span: 12,
          blocks: [
            { id: "b-lb-date", type: "calDate" },
            { id: "b-lb-name", type: "calName" },
            { id: "b-lb-time", type: "calTime" },
            { id: "b-lb-location", type: "calLocation" },
            { id: "b-lb-description", type: "calDescription" },
            { id: "b-lb-category", type: "calCategory" },
            { id: "b-lb-who", type: "calWho" },
            { id: "b-lb-tags", type: "calTags" },
            { id: "b-lb-link", type: "calLink" },
          ],
        },
      ],
    },
  ]);
}

export type CalendarTemplateBlock = CalendarSlotBlock | PageBlock;
