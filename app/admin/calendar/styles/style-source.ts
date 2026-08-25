import {
  monthKeyFromDateKey,
  monthRange,
  normalizeStatus,
  todayDateKey,
  type CalendarEventRecord,
} from "@/lib/calendar";
import { sampleCalendarEvents } from "@/lib/calendar-sample";
import { normalizeCalendarTemplateKind } from "@/lib/calendar";
import { normalizeCalendarTemplateLayout } from "@/lib/calendar-slot-layout";
import { connectDB } from "@/lib/db";
import {
  CalendarEvent,
  CalendarSettings,
  CalendarTemplate,
  FontFamily,
} from "@/lib/models";
import type { PageRow } from "@/lib/page-layout";

/**
 * What the style editor needs: real events for the current month when there are
 * any, samples when there are not, plus every saved layout so the preview can
 * draw through whichever the style picks.
 */
export async function loadStyleEditorSource() {
  await connectDB();

  const settingsDoc = await CalendarSettings.findOne().select("timeZone").lean<any>();
  const todayKey = todayDateKey(settingsDoc?.timeZone);
  const { start, end } = monthRange(monthKeyFromDateKey(todayKey));

  const [eventDocs, templateDocs, fontDocs] = await Promise.all([
    CalendarEvent.find({ date: { $gte: start, $lte: end } })
      .sort({ date: 1, startTime: 1 })
      .limit(60)
      .lean<any[]>(),
    CalendarTemplate.find().sort({ name: 1 }).lean<any[]>(),
    FontFamily.find().select("family").sort({ family: 1 }).lean<any[]>(),
  ]);

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
    rsvpEnabled: Boolean(doc.rsvpEnabled),
    attendanceEnabled: Boolean(doc.attendanceEnabled),
  }));

  const layouts: Record<string, PageRow[]> = {};
  const eventLayouts: { _id: string; name: string }[] = [];
  const lightboxLayouts: { _id: string; name: string }[] = [];

  for (const doc of templateDocs) {
    const id = String(doc._id);
    layouts[id] = normalizeCalendarTemplateLayout(doc.layout);
    const entry = { _id: id, name: doc.name ?? "" };
    if (normalizeCalendarTemplateKind(doc.kind) === "lightbox") lightboxLayouts.push(entry);
    else eventLayouts.push(entry);
  }

  return {
    todayKey,
    // Samples when the month is empty, so every part has something to dress.
    events: real.length > 0 ? real : sampleCalendarEvents(todayKey, "month"),
    layouts,
    eventLayouts,
    lightboxLayouts,
    fonts: fontDocs.map((doc) => String(doc.family)),
  };
}
