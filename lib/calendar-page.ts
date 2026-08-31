import {
  filterCalendarEvents,
  monthKeyFromDateKey,
  listRange,
  monthRange,
  normalizeCalendarPageSettings,
  normalizeStatus,
  todayDateKey,
  weekRange,
  type CalendarEventRecord,
  type CalendarPageSettings,
} from "./calendar";
import {
  calendarStyleLayoutIds,
  emptyCalendarStyle,
  normalizeCalendarStyle,
  type CalendarStyleRecord,
} from "./calendar-style";
import { normalizeCalendarTemplateLayout } from "./calendar-slot-layout";
import { connectDB } from "./db";
import {
  CalendarEvent,
  CalendarSettings,
  CalendarStyle,
  CalendarTemplate,
} from "./models";
import type { PageRow } from "./page-layout";
import { emptyPageSources, type PageSources } from "./page-source-types";

/**
 * Everything the calendar page needs, read in one go.
 *
 * `loadPageSources` does this for calendars *inside* a built page, but it does
 * it as one branch of a much larger sweep over every kind of block a layout can
 * hold. The calendar page has no layout — it is one calendar and nothing else —
 * so asking that machinery for it would mean handing it a fake block and
 * walking a tree with one node in it. This is the same three steps, said
 * directly: which style, which layouts that style reaches for, which events.
 */
export type CalendarPageView = {
  settings: CalendarPageSettings;
  /** The resolved Calendar Style, already fallen back through to the built-in. */
  style: CalendarStyleRecord;
  layouts: Record<string, PageRow[]>;
  /** Enough of a `PageSources` for the event boxes to render through. */
  sources: PageSources;
  /** Published events for the range the page opens on. */
  events: CalendarEventRecord[];
  /** Today in the calendar's configured zone, resolved on the server. */
  todayKey: string;
};

function toEventRecord(doc: Record<string, any>): CalendarEventRecord {
  return {
    _id: String(doc._id),
    date: doc.date ?? "",
    startTime: doc.startTime ?? "",
    endTime: doc.endTime ?? "",
    name: doc.name ?? "",
    description: doc.description ?? "",
    location: doc.location ?? "",
    linkText: doc.linkText ?? "",
    linkUrl: doc.linkUrl ?? "",
    status: normalizeStatus(doc.status),
    category: doc.category ?? "",
    who: Array.isArray(doc.who) ? doc.who.map(String) : [],
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    rsvpEnabled: Boolean(doc.rsvpEnabled),
    attendanceEnabled: Boolean(doc.attendanceEnabled),
  };
}

/** Just the settings, for callers that only need to know whether the page exists. */
export async function getCalendarPageSettings(): Promise<CalendarPageSettings> {
  await connectDB();
  const doc = await CalendarSettings.findOne().select("page").lean<any>();
  return normalizeCalendarPageSettings(doc?.page);
}

/**
 * @param canManage whether the viewer holds `calendar.manage`. Unpublished
 * events are loaded for them, because the page lets them edit from the grid and
 * an event they cannot see is one they cannot fix. The events API applies the
 * same rule, so the first paint and every later month agree.
 */
export async function loadCalendarPage(canManage = false): Promise<CalendarPageView> {
  await connectDB();

  const settingsDoc = await CalendarSettings.findOne()
    .select("timeZone defaultStyleId page")
    .lean<any>();

  const settings = normalizeCalendarPageSettings(settingsDoc?.page);
  const display = settings.display;
  const todayKey = todayDateKey(settingsDoc?.timeZone);

  // Its own style, else the site default, else the built-in look — which is an
  // empty style, so nothing is generated for it.
  const styleId = display.styleId || String(settingsDoc?.defaultStyleId ?? "");
  const styleDoc = styleId
    ? await CalendarStyle.findById(styleId).lean<any>()
    : null;

  const style: CalendarStyleRecord = styleDoc
    ? {
        ...normalizeCalendarStyle(styleDoc),
        _id: String(styleDoc._id),
        slug: styleDoc.slug ?? "",
      }
    : { ...emptyCalendarStyle(), _id: "", slug: "built-in" };

  // One query for every layout the style reaches for — the event box and the
  // lightbox each name one, and both have to be here before the first paint.
  const layouts: Record<string, PageRow[]> = {};
  const layoutIds = calendarStyleLayoutIds(style);
  if (layoutIds.length > 0) {
    const docs = await CalendarTemplate.find({ _id: { $in: layoutIds } }).lean<any[]>();
    for (const doc of docs) {
      layouts[String(doc._id)] = normalizeCalendarTemplateLayout(doc.layout);
    }
  }

  // The range the page opens on, so it paints complete and indexable. Moving to
  // another month is the calendar's own job, through the events API.
  const { start, end } =
    display.view === "week"
      ? weekRange(todayKey)
      : display.view === "list"
        ? // The list runs forward from today rather than covering a month, so
          // the first paint has to be given the same range the browser will
          // ask for — otherwise it fetches again before showing anything.
          listRange(todayKey)
        : monthRange(monthKeyFromDateKey(todayKey));

  const scope: Record<string, unknown> = { date: { $gte: start, $lte: end } };
  if (!canManage) scope.status = "published";

  const eventDocs = todayKey
    ? await CalendarEvent.find(scope).sort({ date: 1, startTime: 1 }).lean<any[]>()
    : [];

  // The page's own category / group / tag narrowing, applied the same way a
  // block applies it — and again in the browser for ranges fetched later.
  const events = filterCalendarEvents(eventDocs.map(toEventRecord), display);

  return {
    settings,
    style,
    layouts,
    // The event boxes render through page blocks, which expect a `PageSources`.
    // Nothing on this page references a story, a collection or a form, so the
    // empty one carries everything that is actually reachable.
    sources: {
      ...emptyPageSources,
      calendarToday: todayKey,
      calendarStyles: style._id ? { [style._id]: style } : {},
      calendarLayouts: layouts,
      calendarDefaultStyleId: String(settingsDoc?.defaultStyleId ?? ""),
      safeMode: false,
    },
    events,
    todayKey,
  };
}
