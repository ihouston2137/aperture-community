import { requirePermission } from "@/lib/access";
import {
  defaultCalendarSettings,
  monthKeyFromDateKey,
  monthRange,
  normalizeDateKey,
  normalizeStatus,
  normalizeView,
  normalizeVocabulary,
  resolveTimeZone,
  systemTimeZone,
  timeZoneOptions,
  todayDateKey,
  weekRange,
  type CalendarEventRecord,
  type CalendarSettingsValues,
} from "@/lib/calendar";
import { connectDB } from "@/lib/db";
import { CalendarEvent, CalendarSettings } from "@/lib/models";

import { CalendarManager } from "./calendar-manager";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  await requirePermission("calendar.manage");
  await connectDB();

  const settingsDoc = await CalendarSettings.findOne().lean<any>();
  const settings: CalendarSettingsValues = {
    timeZone: settingsDoc?.timeZone ?? defaultCalendarSettings.timeZone,
    categories: normalizeVocabulary(settingsDoc?.categories),
    who: normalizeVocabulary(settingsDoc?.who),
    tags: normalizeVocabulary(settingsDoc?.tags),
  };

  const timeZone = resolveTimeZone(settings.timeZone);
  const todayKey = todayDateKey(settings.timeZone);

  const { view: viewParam, date: dateParam } = await searchParams;
  const view = normalizeView(viewParam);
  // One anchor date drives both views, so switching between them stays put.
  const anchorDate = normalizeDateKey(dateParam) || todayKey;

  const range =
    view === "week" ? weekRange(anchorDate) : monthRange(monthKeyFromDateKey(anchorDate));

  const events = await CalendarEvent.find({
    date: { $gte: range.start, $lte: range.end },
  })
    .sort({ date: 1, startTime: 1 })
    .lean<any[]>();

  const records: CalendarEventRecord[] = events.map((event) => ({
    _id: String(event._id),
    date: event.date ?? "",
    startTime: event.startTime ?? "",
    endTime: event.endTime ?? "",
    name: event.name ?? "",
    description: event.description ?? "",
    location: event.location ?? "",
    linkText: event.linkText ?? "",
    linkUrl: event.linkUrl ?? "",
    status: normalizeStatus(event.status),
    category: event.category ?? "",
    who: Array.isArray(event.who) ? event.who.map(String) : [],
    tags: Array.isArray(event.tags) ? event.tags.map(String) : [],
  }));

  // Counts drive the "in use" warnings in settings, so deleting a category or
  // tag from the vocabulary is never a silent decision.
  const countByArrayField = (field: "who" | "tags") =>
    CalendarEvent.aggregate<{ _id: string; count: number }>([
      { $unwind: `$${field}` },
      { $match: { [field]: { $nin: ["", null] } } },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    ]);

  const [categoryUsage, whoUsage, tagUsage] = await Promise.all([
    CalendarEvent.aggregate<{ _id: string; count: number }>([
      { $match: { category: { $nin: ["", null] } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
    countByArrayField("who"),
    countByArrayField("tags"),
  ]);

  const toUsageMap = (rows: { _id: string; count: number }[]) =>
    Object.fromEntries(rows.map((row) => [String(row._id), row.count]));

  return (
    <CalendarManager
      view={view}
      anchorDate={anchorDate}
      events={records}
      // Resolved on the server so the highlight is identical in both renders.
      todayKey={todayKey}
      settings={settings}
      resolvedTimeZone={timeZone}
      // What "follow the server" actually means, which is not the same as the
      // resolved zone once an explicit one is chosen.
      serverTimeZone={systemTimeZone()}
      timeZones={timeZoneOptions()}
      categoryUsage={toUsageMap(categoryUsage)}
      whoUsage={toUsageMap(whoUsage)}
      tagUsage={toUsageMap(tagUsage)}
    />
  );
}
