"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import {
  REPEAT_LIMIT,
  expandWeeklyDates,
  normalizeDateKey,
  normalizeStatus,
  normalizeTimeValue,
  normalizeCalendarTemplateKind,
  normalizeVocabulary,
  resolveTimeZone,
  sanitizeLinkUrl,
} from "@/lib/calendar";
import { normalizeCalendarTemplateLayout } from "@/lib/calendar-slot-layout";
import { connectDB } from "@/lib/db";
import { CalendarEvent, CalendarSettings, CalendarTemplate } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";

/**
 * The dialogs stay open on failure to show the message, so these actions report
 * back rather than throwing.
 */
export type CalendarActionResult = { ok: boolean; error?: string; message?: string };

async function guard() {
  await requirePermission("calendar.manage");
  await connectDB();
}

/**
 * A multi-value chip field. Entries are taken discretely rather than joined and
 * re-split, so a value containing a comma stays intact.
 */
function readChipField(formData: FormData, field: string): string[] {
  return [
    ...new Set(
      formData
        .getAll(field)
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ];
}

export async function saveCalendarEventAction(
  formData: FormData
): Promise<CalendarActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "").trim();

  const date = normalizeDateKey(formData.get("date"));
  if (!date) return { ok: false, error: "Pick a valid date for this event." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give this event a name." };

  const startTime = normalizeTimeValue(formData.get("startTime"));
  const endTime = normalizeTimeValue(formData.get("endTime"));
  if (startTime && endTime && endTime < startTime) {
    return { ok: false, error: "The end time is before the start time." };
  }

  const rawLinkUrl = String(formData.get("linkUrl") ?? "");
  const linkUrl = sanitizeLinkUrl(rawLinkUrl);
  if (rawLinkUrl.trim() && !linkUrl) {
    return { ok: false, error: "That link needs to be an http(s), mailto, or site URL." };
  }

  const payload = {
    date,
    startTime,
    endTime,
    name,
    description: String(formData.get("description") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
    linkText: String(formData.get("linkText") ?? "").trim(),
    linkUrl,
    status: normalizeStatus(formData.get("status")),
    category: String(formData.get("category") ?? "").trim(),
    who: readChipField(formData, "who"),
    tags: readChipField(formData, "tags"),
    rsvpEnabled: formData.get("rsvpEnabled") === "on",
    attendanceEnabled: formData.get("attendanceEnabled") === "on",
  };

  if (id) {
    await CalendarEvent.findByIdAndUpdate(id, payload);
  } else {
    await CalendarEvent.create(payload);
  }

  revalidatePath("/admin/calendar");
  return { ok: true };
}

export async function deleteCalendarEventAction(
  formData: FormData
): Promise<CalendarActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "That event no longer exists." };

  await CalendarEvent.findByIdAndDelete(id);

  revalidatePath("/admin/calendar");
  return { ok: true };
}

/**
 * Copies an event forward onto a weekly pattern — every N weeks, on the chosen
 * days of the week, up to a date in the future. Each copy is a new independent
 * record with only `date` changed; nothing links them, so editing one later
 * does not touch the rest.
 */
export async function repeatCalendarEventAction(
  formData: FormData
): Promise<CalendarActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "That event no longer exists." };

  const source = await CalendarEvent.findById(id).lean<any>();
  if (!source) return { ok: false, error: "That event no longer exists." };

  const untilDate = normalizeDateKey(formData.get("untilDate"));
  if (!untilDate) return { ok: false, error: "Pick a valid date to repeat until." };
  if (untilDate <= source.date) {
    return { ok: false, error: "The repeat-until date has to be after the event." };
  }

  const weekdays = formData
    .getAll("weekdays")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

  const intervalWeeks = Number(formData.get("intervalWeeks") ?? 1);

  const dates = expandWeeklyDates({
    fromDate: source.date,
    weekdays,
    intervalWeeks,
    untilDate,
  });

  if (dates.length === 0) {
    return { ok: false, error: "That pattern does not land on any dates before then." };
  }

  // Re-running the same repeat should not stack identical rows on a date, so
  // anything already matching this event on the same day and time is skipped.
  const existing = await CalendarEvent.find({
    date: { $in: dates },
    name: source.name ?? "",
    startTime: source.startTime ?? "",
  })
    .select("date")
    .lean<{ date: string }[]>();

  const taken = new Set(existing.map((event) => event.date));
  const fresh = dates.filter((date) => !taken.has(date));

  if (fresh.length === 0) {
    return { ok: false, error: "Every date in that pattern already has this event." };
  }

  await CalendarEvent.insertMany(
    fresh.map((date) => ({
      date,
      startTime: source.startTime ?? "",
      endTime: source.endTime ?? "",
      name: source.name ?? "",
      description: source.description ?? "",
      location: source.location ?? "",
      linkText: source.linkText ?? "",
      linkUrl: source.linkUrl ?? "",
      status: normalizeStatus(source.status),
      category: source.category ?? "",
      who: Array.isArray(source.who) ? source.who.map(String) : [],
      tags: Array.isArray(source.tags) ? source.tags.map(String) : [],
      rsvpEnabled: Boolean(source.rsvpEnabled),
      attendanceEnabled: Boolean(source.attendanceEnabled),
    }))
  );

  const skipped = dates.length - fresh.length;
  const capped = dates.length >= REPEAT_LIMIT;

  revalidatePath("/admin/calendar");
  return {
    ok: true,
    message: [
      `Added ${fresh.length} event${fresh.length === 1 ? "" : "s"}.`,
      skipped > 0 ? `${skipped} already existed.` : "",
      capped ? `Stopped at the ${REPEAT_LIMIT}-copy limit.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export async function saveCalendarSettingsAction(
  formData: FormData
): Promise<CalendarActionResult> {
  await guard();

  const payload = {
    // Store "" rather than the resolved zone when nothing was chosen, so the
    // calendar keeps following the server instead of pinning to today's guess.
    timeZone: String(formData.get("timeZone") ?? "").trim(),
    categories: normalizeVocabulary(formData.getAll("categories")),
    who: normalizeVocabulary(formData.getAll("who")),
    tags: normalizeVocabulary(formData.getAll("tags")),
  };

  if (payload.timeZone && resolveTimeZone(payload.timeZone) !== payload.timeZone) {
    return { ok: false, error: "That time zone is not one this server recognizes." };
  }

  await CalendarSettings.findOneAndUpdate({}, { $set: payload }, { upsert: true });

  revalidatePath("/admin/calendar");
  return { ok: true, message: "Calendar settings saved." };
}

/** Builder trees travel as JSON in a hidden field; a bad one is treated as empty. */
function parseJson(value: FormDataEntryValue | null): unknown {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- Templates */

export async function saveCalendarTemplateAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const kind = normalizeCalendarTemplateKind(formData.get("kind"));
  const layout = normalizeCalendarTemplateLayout(parseJson(formData.get("layout")));

  const payload = { name, kind, layout };

  let templateId = id;
  if (id) {
    await CalendarTemplate.findByIdAndUpdate(id, payload);
  } else {
    const slug = await uniqueSlug(CalendarTemplate, slugify(name), "template");
    const created = await CalendarTemplate.create({ ...payload, slug });
    templateId = String(created._id);
  }

  revalidatePath("/admin/calendar/templates");
  revalidatePath("/", "layout");
  redirect(`/admin/calendar/templates/${templateId}/edit?saved=1`);
}

export async function deleteCalendarTemplateAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await CalendarTemplate.findByIdAndDelete(id);

  revalidatePath("/admin/calendar/templates");
  revalidatePath("/admin/pages");
  redirect("/admin/calendar/templates");
}
