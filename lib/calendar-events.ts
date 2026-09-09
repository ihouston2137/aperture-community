import { unstable_cache } from "next/cache";

import {
  calendarFacetQuery,
  normalizeStatus,
  type CalendarEventRecord,
} from "./calendar";
import { connectDB } from "./db";
import { CalendarEvent } from "./models";

/**
 * Reading events: once per question, rather than once per page view.
 *
 * A calendar or an event list on the home page is read on every visit, and the
 * answer is the same for everybody — published events, in a date range,
 * narrowed to a few facets. So the read is cached against exactly that
 * question, and tagged: every write to an event expires the tag from the
 * calendar's own actions, so somebody who saves an event sees it at once
 * rather than whenever the entry happened to lapse.
 *
 * Drafts are the exception and are never cached. They are visible only to
 * somebody holding `calendar.manage`, and a cache keyed by the question rather
 * than by who is asking cannot hold two answers to it.
 */

export const CALENDAR_EVENTS_TAG = "calendar-events";

/**
 * The backstop, for a database edited from outside the app.
 *
 * Long, deliberately: the tag is what keeps this honest in ordinary use, and a
 * short life here would spend queries re-answering a question whose answer is
 * already known to be current.
 */
const CALENDAR_EVENTS_TTL = 3600;

export type CalendarEventQuery = {
  /** Inclusive date keys. */
  start: string;
  end: string;
  /** 0 or absent means every event in the range. */
  limit?: number;
  offset?: number;
  /** Empty means no restriction, exactly as a block's filters mean it. */
  categories?: string[];
  who?: string[];
  tags?: string[];
  /** Only ever for a viewer holding `calendar.manage`. Never cached. */
  includeDrafts?: boolean;
};

export type CalendarEventPage = {
  events: CalendarEventRecord[];
  /** Everything matching the question, whatever this page of it holds. */
  total: number;
};

/** One stored event, reduced to what every renderer reads. */
export function toEventRecord(doc: Record<string, any>): CalendarEventRecord {
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

async function queryEvents(query: CalendarEventQuery): Promise<CalendarEventPage> {
  await connectDB();

  const filter: Record<string, unknown> = {
    date: { $gte: query.start, $lte: query.end },
    ...calendarFacetQuery({
      categories: query.categories ?? [],
      who: query.who ?? [],
      tags: query.tags ?? [],
    }),
  };
  if (!query.includeDrafts) filter.status = "published";

  let find = CalendarEvent.find(filter).sort({ date: 1, startTime: 1 });
  if (query.offset) find = find.skip(query.offset);
  if (query.limit) find = find.limit(query.limit);

  const [docs, total] = await Promise.all([
    find.lean<any[]>(),
    // So a list knows whether "load more" has anything left to load.
    CalendarEvent.countDocuments(filter),
  ]);

  return { events: docs.map(toEventRecord), total };
}

/**
 * The question, spelled one way.
 *
 * Two callers asking the same thing have to produce the same key or the cache
 * is only extra work — hence the fixed order and the sorted facets, which a
 * block and the browser's own re-query can otherwise list differently.
 */
function cacheKey(query: CalendarEventQuery): string {
  return JSON.stringify([
    query.start,
    query.end,
    query.limit ?? 0,
    query.offset ?? 0,
    [...(query.categories ?? [])].sort(),
    [...(query.who ?? [])].sort(),
    [...(query.tags ?? [])].sort(),
  ]);
}

const readCachedEvents = unstable_cache(
  async (key: string): Promise<CalendarEventPage> => {
    const [start, end, limit, offset, categories, who, tags] = JSON.parse(
      key
    ) as [string, string, number, number, string[], string[], string[]];

    return queryEvents({ start, end, limit, offset, categories, who, tags });
  },
  ["calendar-events"],
  { tags: [CALENDAR_EVENTS_TAG], revalidate: CALENDAR_EVENTS_TTL }
);

/** Events matching one question, from the cache where it can be cached. */
export function readCalendarEvents(
  query: CalendarEventQuery
): Promise<CalendarEventPage> {
  if (query.includeDrafts) return queryEvents(query);
  return readCachedEvents(cacheKey(query));
}
