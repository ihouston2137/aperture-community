import { NextResponse } from "next/server";

import {
  normalizeDateKey,
  normalizeStatus,
  type CalendarEventRecord,
} from "@/lib/calendar";
import { connectDB } from "@/lib/db";
import { CalendarEvent } from "@/lib/models";

/**
 * Published calendar events in a date range, for the calendar page block as a
 * visitor moves between months.
 *
 * Public and unauthenticated, so it returns published events only — the same
 * cut the public grid renders. The result count is capped, which bounds the
 * work whatever range is asked for, and `offset` lets a list page through.
 */

const MAX_EVENTS = 500;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const start = normalizeDateKey(searchParams.get("start"));
  const end = normalizeDateKey(searchParams.get("end"));
  if (!start || !end || end < start) {
    return NextResponse.json({ error: "Invalid range." }, { status: 400 });
  }
  // A list asks for one page at a time; the calendar asks for a whole month and
  // sends neither, taking the cap. Either way the count bounds the work, which
  // is why the range itself needs no ceiling.
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), MAX_EVENTS)
      : MAX_EVENTS;

  const offsetParam = Number(searchParams.get("offset"));
  const offset =
    Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 0;

  await connectDB();

  const filter = { status: "published", date: { $gte: start, $lte: end } };

  const [docs, total] = await Promise.all([
    CalendarEvent.find(filter)
      .sort({ date: 1, startTime: 1 })
      .skip(offset)
      .limit(limit)
      .lean<any[]>(),
    // So a list knows whether "load more" has anything left to load.
    CalendarEvent.countDocuments(filter),
  ]);

  const events: CalendarEventRecord[] = docs.map((doc) => ({
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
  }));

  return NextResponse.json({ events, total, hasMore: offset + events.length < total });
}
