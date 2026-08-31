import type { CalendarEventField } from "./calendar";
import { VIEW_MEDIA } from "./responsive-style";
import {
  normalizeStyleValues,
  styleValuesToDeclarations,
  type StyleValues,
} from "./style-values";

/**
 * A Calendar Style: one saved, named record that says how a calendar looks.
 *
 * A calendar is a nest of boxes — the frame, the toolbar, the grid, the day
 * cells, the events inside them — so a style is one value per box, gathered in
 * one place rather than scattered across every calendar on the site. A page
 * block picks a style by name; editing the style restyles every calendar
 * wearing it.
 *
 * Two parts vary by more than the box they sit in:
 *
 * - **Event boxes** vary by view and by screen size, in what they contain as
 *   well as how they look, because a month cell, a week row and a phone are
 *   three different amounts of room.
 * - **The lightbox** varies by screen size alone; there is one detail panel
 *   however a visitor opened it.
 *
 * What either one *contains* is a layout template — the page builder — so the
 * contents are as free-form as any other page and this record only names one.
 */

/* ------------------------------------------------------------------ Parts */

export const CALENDAR_SIZES = ["desktop", "tablet", "mobile"] as const;
export type CalendarSize = (typeof CALENDAR_SIZES)[number];

export const CALENDAR_SIZE_LABELS: Record<CalendarSize, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

export const CALENDAR_STYLE_VIEWS = ["month", "week", "list"] as const;
export type CalendarStyleView = (typeof CALENDAR_STYLE_VIEWS)[number];

export const CALENDAR_STYLE_VIEW_LABELS: Record<CalendarStyleView, string> = {
  month: "Month",
  week: "Week",
  list: "List",
};

/**
 * The boxes a calendar is made of, outermost first.
 *
 * Order is load-bearing: the three day-cell parts dress the same element at
 * equal specificity, so the later rule wins. `today` has to come last or it
 * could never override an ordinary day.
 */
export const CALENDAR_PARTS = [
  "container",
  "navButton",
  "dateTitle",
  "grid",
  "weekdayHeader",
  "dayInMonth",
  "dayOutsideMonth",
  "weekDayBox",
  "listDayBox",
  "listDayBox",
  "today",
  "todayLabel",
] as const;

export type CalendarPart = (typeof CALENDAR_PARTS)[number];

export const CALENDAR_PART_LABELS: Record<CalendarPart, string> = {
  container: "Calendar container",
  navButton: "Navigation buttons",
  dateTitle: "Date range title",
  grid: "Calendar",
  weekdayHeader: "Day of week header",
  dayInMonth: "Days in month",
  dayOutsideMonth: "Days not in month",
  weekDayBox: "Day boxes",
  listDayBox: "List day groups",
  today: "Today box",
  todayLabel: "Today highlight",
};

/** A one-line note per part, so the list needs no separate legend. */
export const CALENDAR_PART_NOTES: Record<CalendarPart, string> = {
  container: "The box around the whole calendar.",
  navButton: "Previous, next, today, and the month/week switch.",
  dateTitle: "The month or week name above the grid.",
  grid: "The grid itself, inside the container.",
  weekdayHeader: "Sun–Sat column headings. Month view only.",
  dayInMonth: "A day cell belonging to the month shown.",
  dayOutsideMonth: "The neighbouring days padding the first and last rows.",
  weekDayBox: "A day in the week list. Week view only.",
  listDayBox: "A date and the events under it. List view only.",
  today: "Overrides whichever day box today falls in.",
  todayLabel:
    "The date itself on today — the number in month view, the heading in the week and list views.",
};

/** Which views a part exists in at all, so the editor can say so. */
export const CALENDAR_PART_VIEWS: Record<CalendarPart, CalendarStyleView[]> = {
  container: ["month", "week", "list"],
  navButton: ["month", "week", "list"],
  dateTitle: ["month", "week", "list"],
  grid: ["month", "week", "list"],
  weekdayHeader: ["month"],
  dayInMonth: ["month"],
  dayOutsideMonth: ["month"],
  weekDayBox: ["week"],
  listDayBox: ["list"],
  today: ["month", "week", "list"],
  todayLabel: ["month", "week", "list"],
};

/** Parts holding no text of their own, so typography would have nothing to act on. */
export const CALENDAR_BOX_PARTS: readonly CalendarPart[] = [
  "container",
  "grid",
  "dayInMonth",
  "dayOutsideMonth",
  "weekDayBox",
];

/* ------------------------------------------------------------- The record */

/**
 * The detail panel at one screen size.
 *
 * Full screen is per size because it is a decision about the screen: a layout
 * that wants the whole window on a phone is very often the same layout that
 * should stay a panel on a desktop, where filling a wide window with one
 * event's details leaves a lot of nothing around it.
 */
export type LightboxVariant = {
  /** A saved lightbox layout. Empty means the built-in arrangement. */
  layoutId: string;
  /** Fills the window rather than sitting as a panel over it. */
  fullScreen: boolean;
};

/** One event box: what it contains, and how the box itself looks. */
export type EventBoxVariant = {
  /** A saved event layout. Empty means the built-in arrangement. */
  layoutId: string;
  style: StyleValues;
};

export type CalendarStyleValues = {
  name: string;
  /** One style per box. */
  parts: Partial<Record<CalendarPart, StyleValues>>;
  /** Event boxes, by view and then by screen size. */
  eventBox: Record<CalendarStyleView, Record<CalendarSize, EventBoxVariant>>;
  /** The detail panel: one style, and a layout per screen size. */
  lightbox: {
    style: StyleValues;
    bySize: Record<CalendarSize, LightboxVariant>;
  };
};

export type CalendarStyleRecord = CalendarStyleValues & {
  _id: string;
  slug: string;
};

function emptyVariant(): EventBoxVariant {
  return { layoutId: "", style: {} };
}

function bySize<T>(make: () => T): Record<CalendarSize, T> {
  return { desktop: make(), tablet: make(), mobile: make() };
}

export function emptyCalendarStyle(): CalendarStyleValues {
  return {
    name: "",
    parts: {},
    eventBox: {
      month: bySize(emptyVariant),
      week: bySize(emptyVariant),
      list: bySize(emptyVariant),
    },
    lightbox: {
      style: {},
      bySize: bySize(() => ({ layoutId: "", fullScreen: false })),
    },
  };
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeVariant(value: unknown): EventBoxVariant {
  const source = (value ?? {}) as Record<string, unknown>;
  return { layoutId: str(source.layoutId), style: normalizeStyleValues(source.style) };
}

function normalizeBySize<T>(
  value: unknown,
  each: (entry: unknown) => T
): Record<CalendarSize, T> {
  const source = (value ?? {}) as Record<string, unknown>;
  return {
    desktop: each(source.desktop),
    tablet: each(source.tablet),
    mobile: each(source.mobile),
  };
}

export function normalizeCalendarStyle(raw: unknown): CalendarStyleValues {
  const source = (raw ?? {}) as Record<string, unknown>;
  const rawParts = (source.parts ?? {}) as Record<string, unknown>;

  const parts: Partial<Record<CalendarPart, StyleValues>> = {};
  for (const part of CALENDAR_PARTS) {
    if (rawParts[part]) parts[part] = normalizeStyleValues(rawParts[part]);
  }

  const rawEventBox = (source.eventBox ?? {}) as Record<string, unknown>;
  const rawLightbox = (source.lightbox ?? {}) as Record<string, unknown>;

  return {
    name: str(source.name),
    parts,
    eventBox: {
      month: normalizeBySize(rawEventBox.month, normalizeVariant),
      week: normalizeBySize(rawEventBox.week, normalizeVariant),
      // A style saved before the list view existed reads back with the list's
      // boxes unset, which is the same as a style that has never dressed them.
      list: normalizeBySize(rawEventBox.list, normalizeVariant),
    },
    lightbox: {
      style: normalizeStyleValues(rawLightbox.style),
      // A style saved before full screen existed carries nothing here, which
      // reads as false — the panel it has always been.
      bySize: normalizeBySize(rawLightbox.bySize, (entry) => ({
        layoutId: str((entry as Record<string, unknown>)?.layoutId),
        fullScreen: Boolean((entry as Record<string, unknown>)?.fullScreen),
      })),
    },
  };
}

/* -------------------------------------------------------------------- CSS */

/** Slugs come from `slugify`, but old records may hold anything. */
function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function calendarStyleClass(slug: string): string {
  return `pb-calstyle-${safeName(slug)}`;
}

/**
 * What each part dresses, relative to the calendar root.
 *
 * An empty selector means the root itself. Two parts carry their own view scope
 * because they exist in one view only.
 */
const PART_SELECTORS: Record<CalendarPart, string[]> = {
  // An empty selector means the root itself.
  container: [""],
  navButton: [".calendar-toolbar .btn"],
  dateTitle: [".calendar-month-label"],
  grid: [".calendar-grid"],
  weekdayHeader: [".calendar-weekday"],
  dayInMonth: [".calendar-grid.is-month .calendar-day:not(.is-outside)"],
  dayOutsideMonth: [".calendar-grid.is-month .calendar-day.is-outside"],
  weekDayBox: [".calendar-grid.is-week .calendar-day"],
  listDayBox: [".calendar-grid.is-list .calendar-day"],
  today: [".calendar-day.is-today"],
  // Month shows a number, week a heading; one part dresses whichever is there.
  // The view class is carried so these outrank the built-in highlight rules on
  // specificity rather than on which stylesheet happens to come last — those
  // rules are themselves view-scoped, so without it the week one only ties.
  todayLabel: [
    ".calendar-grid.is-month .calendar-day.is-today .calendar-day-number",
    ".calendar-grid.is-week .calendar-day.is-today .calendar-day-heading",
    ".calendar-grid.is-list .calendar-day.is-today .calendar-day-heading",
  ],
};

function eventBoxSelector(view: CalendarStyleView, size: CalendarSize): string {
  return `.calendar-grid.is-${view} .calendar-event-box[data-size~="${size}"]`;
}

function rule(selector: string, values: StyleValues | undefined): string {
  const declarations = styleValuesToDeclarations(values);
  return declarations ? `${selector} {\n${declarations}\n}` : "";
}

/**
 * One saved style, as CSS.
 *
 * Scoped to the style's own class, so several calendars on a page can each wear
 * a different one. The parts do not vary by width — sizes are authored in rem
 * and already scale — so the only media queries here decide *which* event box
 * is on screen, not how it looks.
 */
export function calendarStyleCss(style: CalendarStyleRecord): string {
  const root = `.${calendarStyleClass(style.slug)}`;
  const lines: string[] = [];

  for (const part of CALENDAR_PARTS) {
    const selector = PART_SELECTORS[part]
      .map((entry) => (entry ? `${root} ${entry}` : root))
      .join(",\n");
    lines.push(rule(selector, style.parts[part]));
  }

  lines.push(rule(`${root} .calendar-detail`, style.lightbox.style));

  for (const view of CALENDAR_STYLE_VIEWS) {
    for (const size of CALENDAR_SIZES) {
      lines.push(
        rule(`${root} ${eventBoxSelector(view, size)}`, style.eventBox[view][size].style)
      );
    }
  }

  // Which size's box is on screen. One markup tree carries every size, so the
  // page renders complete on the server and CSS reveals the one that fits —
  // picking in JS would mean measuring the window during render.
  for (const size of CALENDAR_SIZES) {
    const mismatched = `${root} [data-size]:not([data-size~="${size}"])`;
    const matched = `${root} [data-size~="${size}"]`;

    lines.push(`@media ${VIEW_MEDIA[size]} {\n${mismatched} {\ndisplay: none;\n}\n}`);

    // The builder canvas is a narrow box in a wide window, so the media query
    // above is answering the *window* while the canvas is showing a phone.
    // Both sets apply there, and since both only hide, the canvas has to put
    // its own size back — hence the `revert`, which the extra compound wins.
    lines.push(
      `.builder-canvas[data-viewport="${size}"] ${matched} {\ndisplay: revert;\n}`
    );
    lines.push(
      `.builder-canvas[data-viewport="${size}"] ${mismatched} {\ndisplay: none;\n}`
    );
  }

  return lines.filter(Boolean).join("\n");
}

/** Which layouts a style references, so a page can load them in one query. */
export function calendarStyleLayoutIds(style: CalendarStyleValues): string[] {
  const ids = new Set<string>();

  for (const view of CALENDAR_STYLE_VIEWS) {
    for (const size of CALENDAR_SIZES) {
      const id = style.eventBox[view][size].layoutId;
      if (id) ids.add(id);
    }
  }
  for (const size of CALENDAR_SIZES) {
    const id = style.lightbox.bySize[size].layoutId;
    if (id) ids.add(id);
  }

  return [...ids];
}

/** What a built-in event box shows when a variant names no layout. */
export const BUILT_IN_EVENT_FIELDS: CalendarEventField[] = [
  "time",
  "location",
  "description",
  "category",
  "who",
  "tags",
  "link",
];
