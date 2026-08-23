import { normalizeDateKey, shiftDateKey } from "./calendar";

/**
 * An event list: the calendar's events as a plain run of items.
 *
 * A calendar answers "what is happening in August"; a list answers "what is
 * coming up". So the window is a range rather than a grid, the count is capped,
 * and the arrangement is a direction rather than a month.
 *
 * Each item is drawn by a layout template — the same records the calendar's
 * event boxes use — so the two never diverge in what an event can look like.
 */

export const EVENT_LIST_DIRECTIONS = ["vertical", "horizontal"] as const;
export type EventListDirection = (typeof EVENT_LIST_DIRECTIONS)[number];

export const EVENT_LIST_DIRECTION_LABELS: Record<EventListDirection, string> = {
  vertical: "Vertical",
  horizontal: "Horizontal",
};

/** What a horizontal list does when the items exceed the width. */
export const EVENT_LIST_OVERFLOWS = ["wrap", "scroll"] as const;
export type EventListOverflow = (typeof EVENT_LIST_OVERFLOWS)[number];

export const EVENT_LIST_OVERFLOW_LABELS: Record<EventListOverflow, string> = {
  wrap: "Wrap onto more lines",
  scroll: "Scroll sideways",
};

/** Ceiling on one page, so a hand-edited layout cannot ask for the whole table. */
export const EVENT_LIST_MAX = 100;

export type EventListSettings = {
  /** Start at today, whatever the range says. */
  fromToday: boolean;
  /** Explicit bounds. Empty means unbounded on that side. */
  startDate: string;
  endDate: string;
  /** How many events to show at once. */
  limit: number;
  /** Offer "load more", which extends the list in place. */
  pagination: boolean;
  direction: EventListDirection;
  /** Horizontal only. */
  overflow: EventListOverflow;
  /** A layout template for each item. Empty means the built-in arrangement. */
  templateId: string;
  /** Empty means no filter — every category, group, or tag qualifies. */
  categories: string[];
  who: string[];
  tags: string[];
};

export const defaultEventListSettings: EventListSettings = {
  fromToday: true,
  startDate: "",
  endDate: "",
  limit: 5,
  pagination: false,
  direction: "vertical",
  overflow: "wrap",
  templateId: "",
  categories: [],
  who: [],
  tags: [],
};

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean)),
  ];
}

export function normalizeEventListSettings(raw: unknown): EventListSettings {
  const source = (raw ?? {}) as Record<string, unknown>;
  const base = defaultEventListSettings;

  const limit = Number(source.limit);

  return {
    fromToday: bool(source.fromToday, base.fromToday),
    startDate: normalizeDateKey(source.startDate),
    endDate: normalizeDateKey(source.endDate),
    limit:
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), EVENT_LIST_MAX)
        : base.limit,
    pagination: bool(source.pagination, base.pagination),
    direction: EVENT_LIST_DIRECTIONS.includes(source.direction as EventListDirection)
      ? (source.direction as EventListDirection)
      : base.direction,
    overflow: EVENT_LIST_OVERFLOWS.includes(source.overflow as EventListOverflow)
      ? (source.overflow as EventListOverflow)
      : base.overflow,
    templateId: String(source.templateId ?? "").trim(),
    categories: stringList(source.categories),
    who: stringList(source.who),
    tags: stringList(source.tags),
  };
}

/**
 * The date window a list draws from.
 *
 * `fromToday` and an explicit start are not alternatives — both narrow, so the
 * later of the two wins. That way "from today" keeps meaning *from today* even
 * on a list whose range opens in the past.
 */
export function eventListRange(
  settings: EventListSettings,
  todayKey: string
): { start: string; end: string } {
  const floors = [settings.startDate, settings.fromToday ? todayKey : ""].filter(
    Boolean
  );

  return {
    // Sortable keys, so the later bound is just the larger string.
    start: floors.length > 0 ? floors.reduce((a, b) => (a > b ? a : b)) : "",
    end: settings.endDate,
  };
}

/**
 * The query a list runs, with its bounds made explicit.
 *
 * An open end becomes a far date rather than an absent one, so the API always
 * receives a range and never has to guess what "no end" should scan.
 */
export function eventListQuery(
  settings: EventListSettings,
  todayKey: string,
  offset = 0
): { start: string; end: string; limit: number; offset: number } {
  const { start, end } = eventListRange(settings, todayKey);

  return {
    start: start || "1970-01-01",
    // Ten years out, which no calendar is expected to outrun, and cheap because
    // the query is bounded by `limit` and served from the date index.
    end: end || shiftDateKey(todayKey, 3650),
    limit: settings.limit,
    offset,
  };
}
