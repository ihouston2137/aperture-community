import type { CalendarTemplateKind } from "./calendar";
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
  "calRsvpButton",
  "calRsvpList",
  "calAttendance",
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
  calRsvpButton: "RSVP button",
  calRsvpList: "RSVP list",
  calAttendance: "Attendance",
};

/**
 * Which template each slot may be placed in.
 *
 * The RSVP button belongs in both — a member should be able to answer from the
 * grid without opening anything. The list and the attendance sheet are detail:
 * they would not fit an event box, and putting a roster in every cell of a
 * month view would be neither readable nor cheap.
 */
export const CALENDAR_SLOT_KINDS: Record<CalendarSlotBlockType, CalendarTemplateKind[]> = {
  calName: ["event", "lightbox"],
  calDate: ["event", "lightbox"],
  calTime: ["event", "lightbox"],
  calLocation: ["event", "lightbox"],
  calDescription: ["event", "lightbox"],
  calCategory: ["event", "lightbox"],
  calWho: ["event", "lightbox"],
  calTags: ["event", "lightbox"],
  calLink: ["event", "lightbox"],
  calRsvpButton: ["event", "lightbox"],
  calRsvpList: ["lightbox"],
  calAttendance: ["lightbox"],
};

export function calendarSlotTypesFor(
  kind: CalendarTemplateKind
): CalendarSlotBlockType[] {
  return CALENDAR_SLOT_BLOCK_TYPES.filter((type) =>
    CALENDAR_SLOT_KINDS[type].includes(kind)
  );
}

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
  calRsvpButton: "CalendarCheck",
  calRsvpList: "ListChecks",
  calAttendance: "ClipboardCheck",
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

  /** `calRsvpButton`: what the button says before and after answering. */
  rsvpText?: string;
  rsvpGoingText?: string;
  rsvpNotGoingText?: string;
  /**
   * The two answered looks. The block’s own style is the resting one; these
   * layer over it, so a state need only say what differs.
   */
  goingStyle?: StyleValues;
  goingStyleSlug?: string;
  notGoingStyle?: StyleValues;
  notGoingStyleSlug?: string;
  /** Appends the yes count to the button, e.g. "RSVP · 12 going". */
  showCount?: boolean;

  /** `calRsvpList`: which answers to list. */
  rsvpShows?: "both" | "yes" | "no";
  /** Names, or just how many said each. */
  namesOrCounts?: "names" | "counts";
  yesHeading?: string;
  noHeading?: string;

  /**
   * `calRsvpList` and `calAttendance`: the membership levels to break out.
   *
   * Named rather than "every level there is", because a list is only readable
   * when it has a few groups in it — a committee and its guests, say, and not
   * one heading per level a site happens to have defined. Anybody holding none
   * of the named levels falls into a single group at the end.
   */
  levelIds?: string[];
  /** What that last group is called. */
  otherHeading?: string;
  /** `calRsvpList`: whether to break the lists out by level at all. */
  groupByLevels?: boolean;

  /** `calAttendance`: opens with only the members who said yes. */
  attendanceFromRsvp?: boolean;
  heading?: string;
  /**
   * `calAttendance`: the two looks a name can wear.
   *
   * A register is read at a glance to see who is missing, and a row of
   * identical ticked and unticked boxes does not answer that at a glance. The
   * chip carries the state in its own colour instead, which is a thing the
   * template can style — so "present" can be as loud as the room needs.
   */
  presentStyle?: StyleValues;
  presentStyleSlug?: string;
  absentStyle?: StyleValues;
  absentStyleSlug?: string;
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
  if (type === "calRsvpButton") {
    block.rsvpText = "RSVP";
    block.rsvpGoingText = "Going";
    block.rsvpNotGoingText = "Not going";
    block.showCount = false;
  }
  if (type === "calRsvpList") {
    block.rsvpShows = "both";
    block.namesOrCounts = "names";
    block.yesHeading = "Going";
    block.noHeading = "Not going";
    block.groupByLevels = false;
    block.levelIds = [];
    block.otherHeading = "Other";
  }
  if (type === "calAttendance") {
    block.attendanceFromRsvp = true;
    block.heading = "Attendance";
    block.levelIds = [];
    block.otherHeading = "Other";
  }
  return block;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Role ids a block names, deduplicated and bounded. */
function levelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(Boolean))].slice(0, 50);
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

  if (type === "calRsvpButton") {
    block.rsvpText = str(raw.rsvpText, "RSVP");
    block.rsvpGoingText = str(raw.rsvpGoingText, "Going");
    block.rsvpNotGoingText = str(raw.rsvpNotGoingText, "Not going");
    block.showCount = Boolean(raw.showCount);

    // The two answered looks, each with its own named-style slot and its own
    // per-view overrides, exactly like the block’s own style above.
    for (const key of ["goingStyle", "notGoingStyle"] as const) {
      const slugKey = `${key}Slug` as "goingStyleSlug" | "notGoingStyleSlug";
      if (raw[slugKey]) block[slugKey] = str(raw[slugKey]);
      if (raw[key]) block[key] = normalizeStyleValues(raw[key]);
      normalizeResponsiveStyle(raw, block, key);
    }
  }

  if (type === "calRsvpList") {
    block.rsvpShows = (["both", "yes", "no"] as const).includes(raw.rsvpShows as "both")
      ? (raw.rsvpShows as CalendarSlotBlock["rsvpShows"])
      : "both";
    block.namesOrCounts = raw.namesOrCounts === "counts" ? "counts" : "names";
    block.yesHeading = str(raw.yesHeading, "Going");
    block.noHeading = str(raw.noHeading, "Not going");
    block.groupByLevels = Boolean(raw.groupByLevels);
    block.levelIds = levelIds(raw.levelIds);
    block.otherHeading = str(raw.otherHeading, "Other");
  }

  if (type === "calAttendance") {
    block.attendanceFromRsvp =
      raw.attendanceFromRsvp === undefined ? true : Boolean(raw.attendanceFromRsvp);
    block.heading = str(raw.heading, "Attendance");
    block.levelIds = levelIds(raw.levelIds);
    block.otherHeading = str(raw.otherHeading, "Other");

    // Present and absent, each with its own named-style slot and its own
    // per-view overrides, exactly like the RSVP button's answered looks.
    for (const key of ["presentStyle", "absentStyle"] as const) {
      const slugKey = `${key}Slug` as "presentStyleSlug" | "absentStyleSlug";
      if (raw[slugKey]) block[slugKey] = str(raw[slugKey]);
      if (raw[key]) block[key] = normalizeStyleValues(raw[key]);
      normalizeResponsiveStyle(raw, block, key);
    }
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
