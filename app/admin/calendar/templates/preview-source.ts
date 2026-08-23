import {
  monthKeyFromDateKey,
  monthRange,
  normalizeStatus,
  todayDateKey,
  type CalendarEventRecord,
} from "@/lib/calendar";
import { sampleCalendarEvents } from "@/lib/calendar-sample";
import { connectDB } from "@/lib/db";
import { CalendarEvent, CalendarSettings } from "@/lib/models";

/**
 * What a template preview needs: real events for the current month when there
 * are any, samples when there are not.
 */
export async function loadTemplatePreviewSource() {
  await connectDB();

  const settingsDoc = await CalendarSettings.findOne().select("timeZone").lean<any>();
  const todayKey = todayDateKey(settingsDoc?.timeZone);
  const { start, end } = monthRange(monthKeyFromDateKey(todayKey));

  const eventDocs = await CalendarEvent.find({ date: { $gte: start, $lte: end } })
    .sort({ date: 1, startTime: 1 })
    .limit(60)
    .lean<any[]>();

  const real: CalendarEventRecord[] = eventDocs.map((doc) => ({
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
  }));

  return {
    todayKey,
    // Samples when the month is empty, so every slot has something to show.
    events: real.length > 0 ? real : sampleCalendarEvents(todayKey, "month"),
  };
}
