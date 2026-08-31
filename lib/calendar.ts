/**
 * Calendar events.
 *
 * Dates and times are stored as plain strings — `YYYY-MM-DD` and 24-hour
 * `HH:MM` — rather than as `Date` instants, because a calendar event is a wall
 * clock commitment, not a moment in time. A `Date` would be written in the
 * server's zone and re-read in the browser's, which slides events across day
 * boundaries and makes "everything in August" a zone-dependent query. Plain
 * keys sort and range-query lexicographically, so neither problem exists.
 */



export const CALENDAR_EVENT_STATUSES = ["draft", "published"] as const;
export type CalendarEventStatus = (typeof CALENDAR_EVENT_STATUSES)[number];

export const CALENDAR_VIEWS = ["month", "week", "list"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  list: "List",
};

export type CalendarEventRecord = {
  _id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** 24-hour `HH:MM`, or "" when the event has no set time. */
  startTime: string;
  endTime: string;
  /** What the grid shows. Events predating this field fall back to description. */
  name: string;
  description: string;
  /** Where the event happens. Free text — a room, a venue, an address. */
  location: string;
  linkText: string;
  linkUrl: string;
  status: CalendarEventStatus;
  category: string;
  /**
   * Which groups the event is for — a section, ensemble, or audience rather
   * than a named individual. A multi-value vocabulary, exactly like tags.
   */
  who: string[];
  tags: string[];
  /** Collects a Yes or No from members. Every RSVP block hides without it. */
  rsvpEnabled: boolean;
  /** Lets a manager record who turned up. The attendance block hides without it. */
  attendanceEnabled: boolean;
};

/** A member answer to an event. There are only ever these two. */
export const RSVP_RESPONSES = ["yes", "no"] as const;
export type RsvpResponse = (typeof RSVP_RESPONSES)[number];

export function normalizeRsvpResponse(value: unknown): RsvpResponse | null {
  return RSVP_RESPONSES.includes(value as RsvpResponse) ? (value as RsvpResponse) : null;
}

/** The managed vocabularies and zone, as the admin screens consume them. */
export type CalendarSettingsValues = {
  /** "" means "follow the server's zone"; see `resolveTimeZone`. */
  timeZone: string;
  categories: string[];
  who: string[];
  tags: string[];
  /**
   * The Calendar Style the admin screen wears.
   *
   * Its own setting rather than the site default: the management screen is
   * read to work on the events, not to admire them, and a style built for a
   * dark public page can make a working grid hard to read. Empty keeps the
   * plain admin look it has always had.
   */
  adminStyleId: string;
};

export const defaultCalendarSettings: CalendarSettingsValues = {
  timeZone: "",
  categories: [],
  who: [],
  tags: [],
  adminStyleId: "",
};

/* ------------------------------------------------------------- Display */

/**
 * The optional fields an event can show. The name is not among them: it is what
 * identifies the event and always renders.
 */
export const CALENDAR_EVENT_FIELDS = [
  "time",
  "location",
  "description",
  "category",
  "who",
  "tags",
  "link",
] as const;

export type CalendarEventField = (typeof CALENDAR_EVENT_FIELDS)[number];

export const CALENDAR_EVENT_FIELD_LABELS: Record<CalendarEventField, string> = {
  time: "Start and end time",
  location: "Location",
  description: "Description",
  category: "Category",
  who: "Who",
  tags: "Tags",
  link: "Link",
};

/**
 * The parts of the calendar a block can dress.
 *
 * Every item of an event carries its own slot rather than sharing one "details"
 * style, so a location can read differently from a tag without either of them
 * dragging the other along.
 */
/**
 * What a calendar block itself decides.
 *
 * Almost nothing: how the calendar *looks* is a Calendar Style, a saved record
 * picked by name, so a block only says which style to wear, how it behaves, and
 * which events qualify. Everything that used to live here — densities, per-part
 * styling, per-size field lists — moved into the style, where one edit reaches
 * every calendar wearing it.
 */
export type CalendarDisplay = {
  /**
   * The view a visitor lands on, on a desktop.
   *
   * Kept under its old name because it is what every saved calendar already
   * holds, and what a calendar with nothing said about the smaller screens
   * still opens as on all three.
   */
  view: CalendarView;
  /** What a tablet opens as. */
  viewTablet: CalendarView;
  /** And a phone — a month grid on a phone is six columns of nothing. */
  viewMobile: CalendarView;
  /**
   * How many events a page of the list holds. Zero shows the lot on one page.
   */
  listPageSize: number;
  showViewSwitch: boolean;
  showNav: boolean;
  showWeekdays: boolean;
  lightbox: boolean;
  /** A saved Calendar Style. Empty means the site default. */
  styleId: string;
  /** Empty means no filter — every category, group, or tag qualifies. */
  categories: string[];
  who: string[];
  tags: string[];
};

export const defaultCalendarDisplay: CalendarDisplay = {
  view: "month",
  viewTablet: "month",
  viewMobile: "list",
  listPageSize: 10,
  showViewSwitch: true,
  showNav: true,
  showWeekdays: true,
  lightbox: true,
  styleId: "",
  categories: [],
  who: [],
  tags: [],
};

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => str(entry)).filter(Boolean))];
}

export function normalizeCalendarDisplay(raw: unknown): CalendarDisplay {
  const source = (raw ?? {}) as Record<string, unknown>;
  const base = defaultCalendarDisplay;

  return {
    view: normalizeView(source.view),
    showViewSwitch: bool(source.showViewSwitch, base.showViewSwitch),
    // A calendar saved before the smaller screens had their own opening view
    // opens as it always did on all three.
    viewTablet: normalizeView(source.viewTablet ?? source.view),
    viewMobile: normalizeView(source.viewMobile ?? source.view),
    listPageSize: Math.max(
      0,
      Math.min(200, Math.round(Number(source.listPageSize ?? base.listPageSize) || 0))
    ),
    showNav: bool(source.showNav, base.showNav),
    showWeekdays: bool(source.showWeekdays, base.showWeekdays),
    lightbox: bool(source.lightbox, base.lightbox),
    styleId: str(source.styleId),
    categories: stringList(source.categories),
    who: stringList(source.who),
    tags: stringList(source.tags),
  };
}

/* --------------------------------------------------------- The calendar page */

/**
 * The site's own calendar page, at `/calendar`.
 *
 * A page block puts a calendar inside a page somebody built; this is the
 * calendar as a place — one address, always there, that a menu item or an email
 * can point at without anybody having to build a page around it first.
 *
 * It wears the same `CalendarDisplay` a block does, so the two are configured
 * with one set of controls and cannot drift apart in what they can express.
 * Everything else here is what a page needs and a block does not: whether it
 * exists at all, and what it says at the top.
 */
export type CalendarPageSettings = {
  /**
   * Off until somebody turns it on. A site that never wanted a calendar page
   * should not quietly acquire an address it did not ask for.
   */
  enabled: boolean;
  title: string;
  /** A line under the title. Plain text; empty shows nothing. */
  intro: string;
  /**
   * What the page sits on. Empty follows the site's content background.
   *
   * The page's own rather than the calendar's: a Calendar Style dresses the
   * grid, its boxes and its detail panel, and the paper behind all of that is
   * a decision about this page — which is why it is here and not in the style.
   */
  backgroundColor: string;
  display: CalendarDisplay;
};

export const defaultCalendarPageSettings: CalendarPageSettings = {
  enabled: false,
  title: "Calendar",
  intro: "",
  backgroundColor: "",
  display: defaultCalendarDisplay,
};

export function normalizeCalendarPageSettings(raw: unknown): CalendarPageSettings {
  const source = (raw ?? {}) as Record<string, unknown>;
  const base = defaultCalendarPageSettings;

  return {
    enabled: bool(source.enabled, base.enabled),
    // A blank title would leave the page with no heading at all, so the
    // default stands in rather than the page rendering headless.
    title: str(source.title).slice(0, 120) || base.title,
    intro: str(source.intro).slice(0, 500),
    // Pages saved before this carry nothing, which means "the site's own" —
    // exactly what they have always shown.
    backgroundColor: str(source.backgroundColor).slice(0, 40),
    display: normalizeCalendarDisplay(source.display),
  };
}

type FilterableEvent = { category: string; who: string[]; tags: string[] };

/**
 * Applies a block's category / group / tag filters. An empty filter list means
 * "no restriction" rather than "match nothing", so a fresh block shows
 * everything.
 */
export function filterCalendarEvents<T extends FilterableEvent>(
  events: T[],
  display: Pick<CalendarDisplay, "categories" | "who" | "tags">
): T[] {
  const matches = (chosen: string[], values: string[]) =>
    chosen.length === 0 || values.some((value) => chosen.includes(value));

  return events.filter(
    (event) =>
      matches(display.categories, event.category ? [event.category] : []) &&
      matches(display.who, event.who) &&
      matches(display.tags, event.tags)
  );
}

export const CALENDAR_TEMPLATE_KINDS = ["event", "lightbox"] as const;
export type CalendarTemplateKind = (typeof CALENDAR_TEMPLATE_KINDS)[number];

export const CALENDAR_TEMPLATE_KIND_LABELS: Record<CalendarTemplateKind, string> = {
  event: "Event box",
  lightbox: "Lightbox",
};

/**
 * A saved arrangement an event is drawn through: a page layout whose calendar
 * slots are filled from the event.
 *
 * A block references one by id rather than copying it, so refining a template
 * updates every calendar using it — which is what makes it a template.
 */
export type CalendarTemplateRecord = {
  _id: string;
  name: string;
  slug: string;
  kind: CalendarTemplateKind;
};

export function normalizeCalendarTemplateKind(value: unknown): CalendarTemplateKind {
  return value === "lightbox" ? "lightbox" : "event";
}



export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WEEKDAY_FULL_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const TIME_VALUE = /^(\d{1,2}):(\d{2})/;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** `YYYY-MM-DD` for a UTC-constructed date. */
function dateKeyFromUTC(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

/**
 * Returns "" for anything that is not a real calendar date, so a rejected value
 * never reaches the database. `2026-02-31` matches the pattern but is not a
 * date, hence the round-trip check.
 */
export function normalizeDateKey(value: unknown): string {
  const match = DATE_KEY.exec(String(value ?? "").trim());
  if (!match) return "";

  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const key = dateKeyFromUTC(parsed);
  return key === `${year}-${month}-${day}` ? key : "";
}

/** Normalizes to 24-hour `HH:MM`; "" means the event has no time set. */
export function normalizeTimeValue(value: unknown): string {
  const match = TIME_VALUE.exec(String(value ?? "").trim());
  if (!match) return "";

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${pad(hours)}:${pad(minutes)}`;
}

export function normalizeStatus(value: unknown): CalendarEventStatus {
  return value === "published" ? "published" : "draft";
}

/** Which view a screen of this size lands on. */
export function openingView(
  display: { view: CalendarView; viewTablet: CalendarView; viewMobile: CalendarView },
  size: "desktop" | "tablet" | "mobile"
): CalendarView {
  if (size === "mobile") return display.viewMobile;
  if (size === "tablet") return display.viewTablet;
  return display.view;
}

export function normalizeView(value: unknown): CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView)
    ? (value as CalendarView)
    : "month";
}

/**
 * What the calendar shows for an event: its name, and nothing else. The
 * description is long-form and never stands in for it. Saving requires a name,
 * so only records predating the field can land on the placeholder.
 */
export function eventLabel(event: { name?: string }): string {
  return (event.name ?? "").trim() || "Untitled event";
}

/**
 * Only http(s), mailto, and site-relative links — never a `javascript:` URL.
 * Returns "" for anything else.
 *
 * Applied both when saving and when rendering an href, so a record written
 * before this existed still cannot put a hostile scheme in the DOM.
 */
export function sanitizeLinkUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (/^(https?:\/\/|mailto:|\/)/i.test(url)) return url;
  // A bare domain is the common case of a user omitting the scheme.
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return `https://${url}`;
  return "";
}

/** Splits a comma- or newline-separated entry into deduped, trimmed tags. */
export function parseTagList(value: unknown): string[] {
  const parts = String(value ?? "")
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

/** The most entries a managed category or tag list may hold. */
const VOCABULARY_LIMIT = 200;

/**
 * The managed category / tag vocabularies: trimmed, de-duplicated
 * case-insensitively (so "Concert" and "concert" cannot both be defined), and
 * sorted so the pickers are stable no matter what order things were added in.
 */
export function normalizeVocabulary(values: unknown): string[] {
  const list = Array.isArray(values) ? values : parseTagList(values);
  const seen = new Map<string, string>();

  for (const raw of list) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b)).slice(0, VOCABULARY_LIMIT);
}

/* ------------------------------------------------------------- Time zones */

/** The zone the server happens to run in — the fallback when none is set. */
export function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Falls back to the system zone when the stored value is empty or unknown. */
export function resolveTimeZone(value: unknown): string {
  const zone = String(value ?? "").trim();
  if (!zone) return systemTimeZone();

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return systemTimeZone();
  }
}

/** Every IANA zone the runtime knows, for the settings picker. */
export function timeZoneOptions(): string[] {
  try {
    const zones = Intl.supportedValuesOf("timeZone");
    if (zones.length > 0) return [...zones];
  } catch {
    // Older runtimes have no `supportedValuesOf`; the system zone alone still
    // lets the setting round-trip.
  }
  return [systemTimeZone()];
}

/**
 * Today in the calendar's own zone.
 *
 * Stored dates are wall-clock keys, so "which cell is today" has to be asked of
 * the configured zone rather than the server's — otherwise a calendar run from
 * a different region highlights the wrong day for part of each day.
 */
export function todayDateKey(timeZone?: string): string {
  const zone = resolveTimeZone(timeZone);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
    const key = `${part("year")}-${part("month")}-${part("day")}`;
    return normalizeDateKey(key) || localTodayDateKey();
  } catch {
    return localTodayDateKey();
  }
}

function localTodayDateKey(): string {
  const now = new Date();
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `America/New_York` reads better as `America / New York`. */
export function timeZoneLabel(zone: string): string {
  return zone.replace(/_/g, " ").replace(/\//g, " / ");
}

/* --------------------------------------------------------------- Months */

export function currentMonthKey(): string {
  const now = new Date();
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}`;
}

/** `YYYY-MM`, falling back to the current month when the input is unusable. */
export function normalizeMonthKey(value: unknown, fallback?: string): string {
  const match = MONTH_KEY.exec(String(value ?? "").trim());
  if (match && Number(match[2]) >= 1 && Number(match[2]) <= 12) {
    return `${match[1]}-${match[2]}`;
  }
  return fallback ?? currentMonthKey();
}

export function monthKeyFromDateKey(dateKey: string): string {
  return normalizeMonthKey(dateKey.slice(0, 7));
}

/** Steps `delta` months, rolling the year over in either direction. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = normalizeMonthKey(monthKey).split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = normalizeMonthKey(monthKey).split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Inclusive `YYYY-MM-DD` bounds for a month, for range queries. Because the
 * keys are fixed-width strings, `$gte`/`$lte` over them is an ordinary sorted
 * index scan.
 */
export function monthRange(monthKey: string): { start: string; end: string } {
  const [year, month] = normalizeMonthKey(monthKey).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${pad(year, 4)}-${pad(month)}-01`,
    end: `${pad(year, 4)}-${pad(month)}-${pad(lastDay)}`,
  };
}

/**
 * How far ahead the list looks, in months.
 *
 * The list is not a month, so it needs some other bound, and "everything ever
 * scheduled" is not one — a site that plans two years out would load two years
 * to show the next ten items. A year forward is long enough that the end of it
 * is never what somebody is looking at, and short enough to be one query.
 */
export const LIST_HORIZON_MONTHS = 12;

/**
 * What is still to come: from today forward, not bounded by a month.
 *
 * A list read down the page has no reason to stop at the end of a month — the
 * thing somebody wants from it is what is coming up next, and on the 30th that
 * is mostly in the month after. The grid views still ask by month, because a
 * grid *is* a month.
 */
export function listRange(fromDateKey: string): { start: string; end: string } {
  const start = normalizeDateKey(fromDateKey) || todayDateKey();
  const horizon = shiftMonthKey(monthKeyFromDateKey(start), LIST_HORIZON_MONTHS);
  return { start, end: monthRange(horizon).end };
}

export type MonthCell = {
  dateKey: string;
  day: number;
  /** False for the leading/trailing days borrowed from the neighbouring months. */
  inMonth: boolean;
};

/**
 * The weeks of a month, Sunday-first, padded out with the surrounding days so
 * every row holds seven cells — and only as many rows as the month needs.
 */
export function buildMonthGrid(monthKey: string): MonthCell[][] {
  const [year, month] = normalizeMonthKey(monthKey).split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = firstOfMonth.getUTCDay();

  const weeks = Math.ceil((leading + daysInMonth) / 7);
  const cells: MonthCell[] = [];

  for (let index = 0; index < weeks * 7; index += 1) {
    const cursor = new Date(firstOfMonth);
    cursor.setUTCDate(cursor.getUTCDate() + index - leading);
    cells.push({
      dateKey: dateKeyFromUTC(cursor),
      day: cursor.getUTCDate(),
      inMonth: cursor.getUTCMonth() === month - 1 && cursor.getUTCFullYear() === year,
    });
  }

  return Array.from({ length: weeks }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/* ---------------------------------------------------------------- Weeks */

/**
 * Steps a date key by whole days. The arithmetic runs in UTC so a DST
 * transition never turns "+1 day" into 23 or 25 hours and lands back on the
 * same key.
 */
export function shiftDateKey(dateKey: string, days: number): string {
  const key = normalizeDateKey(dateKey) || todayDateKey();
  const [year, month, day] = key.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return dateKeyFromUTC(cursor);
}

/** The Sunday on or before `dateKey`, matching the month grid's week start. */
export function startOfWeek(dateKey: string): string {
  const key = normalizeDateKey(dateKey) || todayDateKey();
  return shiftDateKey(key, -dayOfWeekIndex(key));
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeekIndex(dateKey: string): number {
  const key = normalizeDateKey(dateKey);
  if (!key) return 0;
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Inclusive bounds for the week containing `dateKey`. */
export function weekRange(dateKey: string): { start: string; end: string } {
  const start = startOfWeek(dateKey);
  return { start, end: shiftDateKey(start, 6) };
}

/** The seven days of a week, Sunday-first. */
export function buildWeek(dateKey: string): MonthCell[] {
  const start = startOfWeek(dateKey);
  return Array.from({ length: 7 }, (_, offset) => {
    const key = shiftDateKey(start, offset);
    return { dateKey: key, day: Number(key.slice(8, 10)), inMonth: true };
  });
}

/**
 * `Aug 16 – 22, 2026`, collapsing whatever the two ends share — the month when
 * the week sits inside one, the year when it does not.
 */
export function weekLabel(dateKey: string): string {
  const { start, end } = weekRange(dateKey);
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);

  const startName = MONTH_NAMES[startMonth - 1].slice(0, 3);
  const endName = MONTH_NAMES[endMonth - 1].slice(0, 3);

  if (startYear !== endYear) {
    return `${startName} ${startDay}, ${startYear} – ${endName} ${endDay}, ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startName} ${startDay} – ${endName} ${endDay}, ${endYear}`;
  }
  return `${startName} ${startDay} – ${endDay}, ${endYear}`;
}

/* ------------------------------------------------------------- Repeating */

/** Ceiling on one repeat run, so a far-off end date cannot flood the database. */
export const REPEAT_LIMIT = 260;

export type RepeatOptions = {
  /** The source event's date. Only dates strictly after it are produced. */
  fromDate: string;
  /** Which days to land on, 0 = Sunday. Empty means the source event's own day. */
  weekdays: number[];
  /** 1 = every week, 2 = every other week, and so on. */
  intervalWeeks: number;
  /** Inclusive last date to produce. */
  untilDate: string;
};

/**
 * The dates a weekly repeat would land on: every `intervalWeeks` weeks, on the
 * chosen days of the week, from just after the source event up to `untilDate`.
 *
 * Weeks are stepped from the source event's own week, so "every other week"
 * stays in phase with the event rather than with an arbitrary epoch.
 */
export function expandWeeklyDates(options: RepeatOptions): string[] {
  const fromDate = normalizeDateKey(options.fromDate);
  const untilDate = normalizeDateKey(options.untilDate);
  if (!fromDate || !untilDate || untilDate <= fromDate) return [];

  const interval = Math.max(1, Math.min(52, Math.floor(options.intervalWeeks) || 1));
  const weekdays = [
    ...new Set(
      (options.weekdays.length > 0 ? options.weekdays : [dayOfWeekIndex(fromDate)])
        .map((day) => Math.floor(day))
        .filter((day) => day >= 0 && day <= 6)
    ),
  ].sort((a, b) => a - b);
  if (weekdays.length === 0) return [];

  const dates: string[] = [];
  let weekStart = startOfWeek(fromDate);

  while (weekStart <= untilDate && dates.length < REPEAT_LIMIT) {
    for (const weekday of weekdays) {
      const candidate = shiftDateKey(weekStart, weekday);
      if (candidate > fromDate && candidate <= untilDate) dates.push(candidate);
      if (dates.length >= REPEAT_LIMIT) break;
    }
    weekStart = shiftDateKey(weekStart, interval * 7);
  }

  return dates;
}

/* -------------------------------------------------------------- Display */

/** `14:30` becomes `2:30 PM`; a bare hour drops the `:00`. */
export function formatTimeLabel(value: string): string {
  const time = normalizeTimeValue(value);
  if (!time) return "";

  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour12} ${suffix}` : `${hour12}:${pad(minutes)} ${suffix}`;
}

export function formatEventTimeRange(startTime: string, endTime: string): string {
  const start = formatTimeLabel(startTime);
  const end = formatTimeLabel(endTime);
  if (start && end) return `${start} – ${end}`;
  return start || end || "All day";
}

/** Long form for dialog headings, e.g. `Friday, August 21, 2026`. */
export function formatDateLabel(dateKey: string): string {
  const key = normalizeDateKey(dateKey);
  if (!key) return "";

  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAY_FULL_LABELS[weekday]}, ${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

/**
 * A day heading for the week list, e.g. `Friday, August 21`. The year is left
 * off — the range label above the list already carries it.
 */
export function formatDayHeading(dateKey: string): string {
  const key = normalizeDateKey(dateKey);
  if (!key) return "";

  const [year, month, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAY_FULL_LABELS[weekday]}, ${MONTH_NAMES[month - 1]} ${day}`;
}

/**
 * Chronological: the day first, then the time within it, then the name.
 *
 * The date leads because a list runs down the calendar rather than across one
 * day of it — without it, every day's nine o'clock event comes before every
 * day's ten o'clock, and the days interleave. The month grid sorts a single
 * day at a time, where the dates are all equal and this decides nothing, so
 * one comparator serves both.
 *
 * Untimed events carry an empty start time, which sorts before any clock time
 * and so leads its day — which is where something happening on a day but at no
 * particular time belongs.
 */
export function sortEvents<T extends { date: string; startTime: string; name?: string }>(
  events: T[]
): T[] {
  return [...events].sort((a, b) => {
    // Date keys are fixed-width `YYYY-MM-DD`, so comparing them as text is
    // comparing them as dates — the reason the format was chosen.
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    return eventLabel(a).localeCompare(eventLabel(b));
  });
}

/** Groups a month's events by date key, so the grid can look each day up. */
export function groupEventsByDate<T extends { date: string }>(
  events: T[]
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const event of events) {
    (grouped[event.date] ??= []).push(event);
  }
  return grouped;
}
